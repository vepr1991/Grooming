import os
import threading
import logging
import json
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
import telebot
from telebot import types

# --- 1. Настройка Логирования ---
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# --- 2. Конфигурация ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

if not all([SUPABASE_URL, SUPABASE_KEY, TELEGRAM_BOT_TOKEN]):
    logger.critical("⚠️ ОШИБКА: Не заданы переменные окружения!")

# Инициализация клиентов
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN)


# --- 3. Управление жизненным циклом (Lifespan) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ЗАПУСК
    if os.environ.get("RUN_BOT") != "false":
        logger.info("🚀 Запуск сервера и Telegram бота...")
        bot_thread = threading.Thread(target=start_bot_polling, daemon=True)
        bot_thread.start()

    yield

    # ОСТАНОВКА
    logger.info("🛑 Остановка сервера...")
    try:
        bot.stop_polling()
    except Exception:
        pass


app = FastAPI(title="Grooming API", version="2.3", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- 4. Модели данных ---
class ClientInfo(BaseModel):
    name: str
    phone: str
    telegram_user: Optional[Dict[str, Any]] = None


class PetInfo(BaseModel):
    name: str
    petBreed: Optional[str] = ""


class ServiceInfo(BaseModel):
    id: str
    title: str
    duration_minutes: int


class BookingRequest(BaseModel):
    salonId: str
    service: ServiceInfo
    date: str
    time: str
    client: ClientInfo
    pet: PetInfo


class StatusUpdate(BaseModel):
    status: str


# --- 5. Вспомогательные функции ---

def start_bot_polling():
    """Запуск бота с защитой от падений"""
    try:
        bot.remove_webhook()
        time.sleep(1)
        logger.info("🤖 Бот начал прослушивание...")
        bot.infinity_polling(timeout=10, long_polling_timeout=5)
    except Exception as e:
        logger.error(f"Бот упал с ошибкой: {e}")


def check_overlap(salon_id: str, start_time: datetime, end_time: datetime) -> bool:
    """Проверка занятости слота"""
    try:
        response = supabase.table("appointments") \
            .select("id") \
            .eq("salon_id", salon_id) \
            .neq("status", "canceled") \
            .lt("start_time", end_time.isoformat()) \
            .gt("end_time", start_time.isoformat()) \
            .execute()
        return len(response.data) > 0
    except Exception as e:
        logger.error(f"Ошибка проверки слотов: {e}")
        return True


def send_telegram_notification_task(salon_id: str, booking_data: BookingRequest, start_dt: datetime):
    """Отправка уведомления МАСТЕРУ о новой записи"""
    try:
        res = supabase.table("salons").select("telegram_chat_id, name").eq("id", salon_id).single().execute()

        if not res.data:
            return

        master_chat_id = res.data.get("telegram_chat_id")
        salon_name = res.data.get("name")

        if master_chat_id:
            pet_info = f"{booking_data.pet.name}"
            if booking_data.pet.petBreed:
                pet_info += f" ({booking_data.pet.petBreed})"

            msg = (
                f"🔔 <b>Новая запись в {salon_name}!</b>\n\n"
                f"👤 <b>Клиент:</b> {booking_data.client.name}\n"
                f"📞 <b>Тел:</b> {booking_data.client.phone}\n"
                f"🐶 <b>Питомец:</b> {pet_info}\n"
                f"✂️ <b>Услуга:</b> {booking_data.service.title}\n"
                f"📅 <b>Дата:</b> {start_dt.strftime('%d.%m.%Y')}\n"
                f"⏰ <b>Время:</b> {start_dt.strftime('%H:%M')}\n\n"
                f"<i>Зайдите в приложение, чтобы подтвердить.</i>"
            )

            markup = types.InlineKeyboardMarkup()
            FRONTEND_URL = "https://grooming-react-front.onrender.com"
            web_app_info = types.WebAppInfo(url=f"{FRONTEND_URL}/master")
            markup.add(types.InlineKeyboardButton("Открыть админку", web_app=web_app_info))

            bot.send_message(master_chat_id, msg, parse_mode="HTML", reply_markup=markup)
            logger.info(f"Уведомление отправлено мастеру: {master_chat_id}")

    except Exception as e:
        logger.error(f"Ошибка отправки Telegram уведомления мастеру: {e}")


def send_client_confirmation(appointment_id: str):
    """Отправка уведомления КЛИЕНТУ о подтверждении"""
    try:
        # 1. Получаем полные данные о записи, включая салон и услугу
        # Используем join через Supabase (зависит от настройки FK, но попробуем получить данные по отдельности, если join сложен)
        # Надежнее получить данные appointments, а потом догрузить остальное
        app_res = supabase.table("appointments").select("*, salons(name, phone), services(title)").eq("id",
                                                                                                      appointment_id).single().execute()

        if not app_res.data:
            logger.warning("Запись не найдена для уведомления клиента")
            return

        appt = app_res.data
        client_tg_raw = appt.get("client_tg_user")

        # Если у клиента нет Telegram (ручная запись), выходим
        if not client_tg_raw:
            return

        # Парсим данные клиента
        if isinstance(client_tg_raw, str):
            client_tg = json.loads(client_tg_raw)
        else:
            client_tg = client_tg_raw

        client_chat_id = client_tg.get("id")

        if not client_chat_id:
            return

        # Форматируем дату и время
        # Supabase возвращает ISO формат (например: 2026-02-16T10:00:00+00:00)
        start_dt = datetime.fromisoformat(appt["start_time"].replace("Z", "+00:00"))

        # Корректируем время (если нужно) или выводим как есть (UTC).
        # В идеале хранить таймзону салона, но пока выведем как в базе + смещение если нужно.
        # Для простоты пока выводим то, что в базе (предполагаем, что оно корректно отображается)
        date_str = start_dt.strftime('%d.%m.%Y')
        time_str = start_dt.strftime('%H:%M')

        salon_name = appt['salons']['name'] if appt.get('salons') else "Салон"
        service_title = appt['services']['title'] if appt.get('services') else "Услуга"
        salon_phone = appt['salons'].get('phone', '') if appt.get('salons') else ""

        msg = (
            f"✅ <b>Ваша запись подтверждена!</b>\n\n"
            f"✂️ <b>Салон:</b> {salon_name}\n"
            f"🛠 <b>Услуга:</b> {service_title}\n"
            f"📅 <b>Дата:</b> {date_str}\n"
            f"⏰ <b>Время:</b> {time_str}\n"
        )

        if salon_phone:
            msg += f"\n📞 <b>Телефон для связи:</b> {salon_phone}"

        bot.send_message(client_chat_id, msg, parse_mode="HTML")
        logger.info(f"Уведомление отправлено клиенту: {client_chat_id}")

    except Exception as e:
        logger.error(f"Ошибка отправки уведомления клиенту: {e}")


# --- 6. API Endpoints ---

@app.get("/")
def health_check():
    return {"status": "active", "service": "Grooming Backend v2.3"}


@app.get("/api/user-status/{tg_id}")
async def check_user_status(tg_id: int):
    try:
        res = supabase.table("salons").select("id").eq("telegram_chat_id", tg_id).execute()
        if res.data and len(res.data) > 0:
            return {"isMaster": True, "salonId": res.data[0]['id']}
        return {"isMaster": False}
    except Exception as e:
        logger.error(f"Error checking user status: {e}")
        return {"isMaster": False}


@app.post("/api/book")
async def create_booking(data: BookingRequest, background_tasks: BackgroundTasks):
    try:
        logger.info(f"Запрос на запись: {data.client.name}")

        try:
            start_dt = datetime.fromisoformat(f"{data.date}T{data.time}:00")
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат даты")

        duration = data.service.duration_minutes or 30
        end_dt = start_dt + timedelta(minutes=duration)

        # 1. Проверка занятости
        if check_overlap(data.salonId, start_dt, end_dt):
            raise HTTPException(status_code=409, detail="Это время уже занято")

        # 2. Подготовка данных
        client_tg_json = None
        if data.client.telegram_user:
            client_tg_json = json.dumps(data.client.telegram_user)

        insert_payload = {
            "salon_id": data.salonId,
            "service_id": data.service.id,
            "client_name": data.client.name,
            "client_phone": data.client.phone,
            "client_tg_user": client_tg_json,
            "pet_name": data.pet.name,
            "pet_breed": data.pet.petBreed,
            "start_time": start_dt.isoformat(),
            "end_time": end_dt.isoformat(),
            "status": "pending"
        }

        # 3. Запись в БД
        res = supabase.table("appointments").insert(insert_payload).execute()

        if not res.data:
            raise HTTPException(status_code=500, detail="Ошибка базы данных")

        # 4. Уведомление МАСТЕРУ
        background_tasks.add_task(send_telegram_notification_task, data.salonId, data, start_dt)

        return {"success": True, "id": res.data[0]['id']}

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Critical Error: {e}")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@app.patch("/api/appointments/{appointment_id}/status")
async def update_appointment_status(appointment_id: str, payload: StatusUpdate, background_tasks: BackgroundTasks):
    try:
        # 1. Обновляем статус
        res = supabase.table("appointments").update({"status": payload.status}).eq("id", appointment_id).execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="Запись не найдена")

        # 2. Если статус CONFIRMED, отправляем уведомление КЛИЕНТУ фоном
        if payload.status == 'confirmed':
            background_tasks.add_task(send_client_confirmation, appointment_id)

        return {"success": True, "data": res.data[0]}
    except Exception as e:
        logger.error(f"Error updating status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- 7. Бот команды ---
@bot.message_handler(commands=['start'])
def handle_start(message):
    chat_id = message.chat.id
    text = (
        f"👋 Привет, {message.from_user.first_name}!\n\n"
        f"Твой Chat ID: `{chat_id}`\n\n"
        "Скопируй этот ID и вставь при регистрации, если ты мастер."
    )
    bot.reply_to(message, text, parse_mode="Markdown")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)