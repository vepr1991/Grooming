import os
import threading
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict

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

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN)
app = FastAPI(title="Grooming API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- 3. Модели данных ---
class ClientInfo(BaseModel):
    name: str
    phone: str


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


# --- 4. Бизнес-логика ---
def check_overlap(salon_id: str, start_time: datetime, end_time: datetime) -> bool:
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
    try:
        res = supabase.table("salons").select("telegram_chat_id, name").eq("id", salon_id).single().execute()
        if not res.data: return

        master_chat_id = res.data.get("telegram_chat_id")
        salon_name = res.data.get("name")

        if master_chat_id:
            msg = (
                f"🔔 *Новая запись в {salon_name}!*\n\n"
                f"👤 *Клиент:* {booking_data.client.name}\n"
                f"📞 *Тел:* `{booking_data.client.phone}`\n"
                f"🐶 *Питомец:* {booking_data.pet.name} {f'({booking_data.pet.petBreed})' if booking_data.pet.petBreed else ''}\n"
                f"✂️ *Услуга:* {booking_data.service.title}\n"
                f"📅 *Дата:* {start_dt.strftime('%d.%m.%Y')}\n"
                f"⏰ *Время:* {start_dt.strftime('%H:%M')}\n"
            )
            # URL нужно заменить на реальный домен фронтенда
            web_app_url = "https://your-frontend-domain.vercel.app"
            markup = types.InlineKeyboardMarkup()
            markup.add(types.InlineKeyboardButton("Открыть админку", url=web_app_url))

            bot.send_message(master_chat_id, msg, parse_mode="Markdown", reply_markup=markup)
            logger.info(f"Уведомление отправлено мастеру: {master_chat_id}")

    except Exception as e:
        logger.error(f"Ошибка отправки Telegram: {e}")


# --- 5. API Endpoints ---
@app.get("/")
def health_check():
    return {"status": "active", "service": "Grooming Backend"}


# НОВЫЙ ЭНДПОИНТ: Проверка статуса пользователя (Мастер или нет)
@app.get("/api/user-status/{tg_id}")
async def check_user_status(tg_id: int):
    try:
        # Проверяем, привязан ли этот TG ID к какому-то салону
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
        logger.info(f"Запрос на запись: {data.client.name} -> {data.salonId}")
        try:
            start_dt = datetime.fromisoformat(f"{data.date}T{data.time}:00")
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат даты")

        duration = data.service.duration_minutes or 30
        end_dt = start_dt + timedelta(minutes=duration)

        if check_overlap(data.salonId, start_dt, end_dt):
            raise HTTPException(status_code=409, detail="Это время уже занято")

        payload = {
            "salon_id": data.salonId,
            "service_id": data.service.id,
            "client_name": data.client.name,
            "client_phone": data.client.phone,
            "pet_name": data.pet.name,
            "pet_breed": data.pet.petBreed,
            "start_time": start_dt.isoformat(),
            "end_time": end_dt.isoformat(),
            "status": "pending"
        }

        res = supabase.table("appointments").insert(payload).execute()
        if not res.data: raise HTTPException(status_code=500, detail="Ошибка БД")

        background_tasks.add_task(send_telegram_notification_task, data.salonId, data, start_dt)
        return {"success": True, "id": res.data[0]['id']}

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Critical Error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера")


# --- 6. Бот ---
@bot.message_handler(commands=['start'])
def handle_start(message):
    chat_id = message.chat.id
    text = (
        f"👋 Привет, {message.from_user.first_name}!\n\n"
        f"Твой Chat ID: `{chat_id}`\n\n"
        "1. Скопируй этот ID (кликни).\n"
        "2. Вставь его при регистрации салона."
    )
    bot.reply_to(message, text, parse_mode="Markdown")


def start_bot_polling():
    try:
        bot.remove_webhook()
        bot.infinity_polling()
    except Exception as e:
        logger.error(f"Бот упал: {e}")


if os.environ.get("RUN_BOT") != "false":
    threading.Thread(target=start_bot_polling, daemon=True).start()

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)