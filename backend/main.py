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

# --- 1. Настройка и Конфигурация ---
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

if not all([SUPABASE_URL, SUPABASE_KEY, TELEGRAM_BOT_TOKEN]):
    logger.critical("⚠️ ОШИБКА: Не заданы переменные окружения!")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN)


# --- 2. Жизненный цикл ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.environ.get("RUN_BOT") != "false":
        logger.info("🚀 Запуск сервера и Telegram бота...")
        threading.Thread(target=start_bot_polling, daemon=True).start()
    yield
    logger.info("🛑 Остановка сервера...")
    try:
        bot.stop_polling()
    except Exception:
        pass


app = FastAPI(title="Grooming API", version="3.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# --- 3. Модели данных (Pydantic) ---
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


class SalonCreate(BaseModel):
    telegram_chat_id: int
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    slot_step: Optional[int] = 30


class SalonUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    description: Optional[str] = None
    schedule: Optional[str] = None
    photo_url: Optional[str] = None
    slot_step: Optional[int] = None


class ServiceCreate(BaseModel):
    salon_id: str
    title: str
    description: Optional[str] = ""
    price: int
    duration_minutes: int
    image_url: Optional[str] = ""


class ServiceUpdate(BaseModel):
    title: Optional[str] = None
    price: Optional[int] = None
    duration_minutes: Optional[int] = None
    description: Optional[str] = None
    image_url: Optional[str] = None


# --- 4. Вспомогательные функции (Логика) ---

def start_bot_polling():
    try:
        bot.remove_webhook()
        time.sleep(1)
        logger.info("🤖 Бот начал прослушивание...")
        bot.infinity_polling(timeout=10, long_polling_timeout=5)
    except Exception as e:
        logger.error(f"Бот упал с ошибкой: {e}")


def check_overlap(salon_id: str, start_time: datetime, end_time: datetime) -> bool:
    try:
        response = supabase.table("appointments").select("id").eq("salon_id", salon_id) \
            .neq("status", "canceled").lt("start_time", end_time.isoformat()) \
            .gt("end_time", start_time.isoformat()).execute()
        return len(response.data) > 0
    except Exception:
        return True


def fetch_appointment_data(appointment_id: str):
    """Единая функция для получения полных данных о записи"""
    res = supabase.table("appointments").select("*, salons(name, phone), services(title)").eq("id",
                                                                                              appointment_id).single().execute()
    if not res.data: return None

    appt = res.data
    # Парсинг Telegram юзера
    tg_user = appt.get("client_tg_user")
    if tg_user and isinstance(tg_user, str):
        tg_user = json.loads(tg_user)

    appt["client_tg_user"] = tg_user
    return appt


def send_telegram_notification_task(salon_id: str, data: BookingRequest, start_dt: datetime):
    """Уведомление МАСТЕРУ"""
    try:
        res = supabase.table("salons").select("telegram_chat_id, name").eq("id", salon_id).single().execute()
        if not res.data: return

        master_chat_id = res.data.get("telegram_chat_id")
        if master_chat_id:
            pet_info = f"{data.pet.name} ({data.pet.petBreed})" if data.pet.petBreed else data.pet.name
            msg = (
                f"🔔 <b>Новая запись в {res.data.get('name')}!</b>\n\n"
                f"👤 <b>Клиент:</b> {data.client.name}\n"
                f"📞 <b>Тел:</b> {data.client.phone}\n"
                f"🐶 <b>Питомец:</b> {pet_info}\n"
                f"✂️ <b>Услуга:</b> {data.service.title}\n"
                f"📅 <b>Дата:</b> {start_dt.strftime('%d.%m.%Y %H:%M')}\n\n"
                f"<i>Зайдите в приложение для подтверждения.</i>"
            )
            markup = types.InlineKeyboardMarkup()
            FRONTEND_URL = "https://grooming-react-front.onrender.com"
            markup.add(
                types.InlineKeyboardButton("Открыть админку", web_app=types.WebAppInfo(url=f"{FRONTEND_URL}/master")))
            bot.send_message(master_chat_id, msg, parse_mode="HTML", reply_markup=markup)
            logger.info(f"Master notified: {master_chat_id}")
    except Exception as e:
        logger.error(f"Master notify error: {e}")


def send_client_notification(appointment_id: str, status_type: str):
    """Универсальное уведомление КЛИЕНТУ"""
    try:
        appt = fetch_appointment_data(appointment_id)
        if not appt: return

        client_chat_id = appt.get("client_tg_user", {}).get("id")
        if not client_chat_id: return

        start_dt = datetime.fromisoformat(appt["start_time"].replace("Z", "+00:00"))
        date_str = start_dt.strftime('%d.%m.%Y')
        time_str = start_dt.strftime('%H:%M')

        salon_name = appt['salons']['name'] if appt.get('salons') else "Салон"
        service_title = appt['services']['title'] if appt.get('services') else "Услуга"
        salon_phone = appt['salons'].get('phone', '') if appt.get('salons') else ""

        # Шаблоны сообщений
        templates = {
            'confirmed': f"✅ <b>Ваша запись подтверждена!</b>\n\n✂️ <b>Салон:</b> {salon_name}\n🛠 <b>Услуга:</b> {service_title}\n📅 <b>Дата:</b> {date_str}\n⏰ <b>Время:</b> {time_str}",
            'canceled': f"❌ <b>Ваша запись отменена</b>\n\n✂️ <b>Салон:</b> {salon_name}\n🛠 <b>Услуга:</b> {service_title}\n📅 <b>Дата:</b> {date_str}\n⏰ <b>Время:</b> {time_str}\n\n<i>Приносим извинения.</i>"
        }

        msg = templates.get(status_type)
        if not msg: return

        if status_type == 'confirmed' and salon_phone:
            msg += f"\n📞 <b>Телефон для связи:</b> {salon_phone}"

        bot.send_message(client_chat_id, msg, parse_mode="HTML")
        logger.info(f"Client notified ({status_type}): {client_chat_id}")
    except Exception as e:
        logger.error(f"Client notify error: {e}")


# --- 5. API Endpoints ---

@app.get("/")
def health_check(): return {"status": "active", "service": "Grooming Backend v3.0"}


@app.get("/api/user-status/{tg_id}")
async def check_user_status(tg_id: int):
    try:
        res = supabase.table("salons").select("id").eq("telegram_chat_id", tg_id).execute()
        if res.data: return {"isMaster": True, "salonId": res.data[0]['id']}
        return {"isMaster": False}
    except Exception:
        return {"isMaster": False}


@app.post("/api/book")
async def create_booking(data: BookingRequest, background_tasks: BackgroundTasks):
    try:
        start_dt = datetime.fromisoformat(f"{data.date}T{data.time}:00")
        end_dt = start_dt + timedelta(minutes=data.service.duration_minutes)

        if check_overlap(data.salonId, start_dt, end_dt):
            raise HTTPException(status_code=409, detail="Это время уже занято")

        client_tg_json = json.dumps(data.client.telegram_user) if data.client.telegram_user else None

        insert_payload = {
            "salon_id": data.salonId, "service_id": data.service.id,
            "client_name": data.client.name, "client_phone": data.client.phone,
            "client_tg_user": client_tg_json, "pet_name": data.pet.name, "pet_breed": data.pet.petBreed,
            "start_time": start_dt.isoformat(), "end_time": end_dt.isoformat(), "status": "pending"
        }
        res = supabase.table("appointments").insert(insert_payload).execute()
        if not res.data: raise HTTPException(status_code=500, detail="DB Error")

        background_tasks.add_task(send_telegram_notification_task, data.salonId, data, start_dt)
        return {"success": True, "id": res.data[0]['id']}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Book error: {e}")
        raise HTTPException(status_code=500, detail="Server Error")


@app.patch("/api/appointments/{appointment_id}/status")
async def update_appointment_status(appointment_id: str, payload: StatusUpdate, background_tasks: BackgroundTasks):
    try:
        res = supabase.table("appointments").update({"status": payload.status}).eq("id", appointment_id).execute()
        if not res.data: raise HTTPException(status_code=404, detail="Not Found")

        # Универсальная отправка уведомления
        if payload.status in ['confirmed', 'canceled']:
            background_tasks.add_task(send_client_notification, appointment_id, payload.status)

        return {"success": True, "data": res.data[0]}
    except Exception as e:
        logger.error(f"Status update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- CRUD Салоны и Услуги ---

@app.post("/api/register")
async def register_salon(payload: SalonCreate):
    try:
        existing = supabase.table("salons").select("id").eq("telegram_chat_id", payload.telegram_chat_id).execute()
        if existing.data: return {"success": True, "data": existing.data[0], "message": "Exists"}

        slug_val = f"salon_{payload.telegram_chat_id}_{int(time.time())}"
        default_schedule = json.dumps([
            {"day": d, "hours": {"start": "10:00", "end": "20:00"}, "isWorking": d not in ["Сб", "Вс"]}
            if d not in ["Сб", "Вс"] else
            {"day": d, "hours": {"start": "10:00", "end": "18:00"}, "isWorking": d == "Сб"}
            for d in ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
        ])

        new_salon = {
            "telegram_chat_id": payload.telegram_chat_id, "name": payload.name,
            "address": payload.address, "phone": payload.phone, "slug": slug_val,
            "is_active": True, "work_start": "10:00", "work_end": "20:00",
            "slot_step": payload.slot_step or 30, "schedule": default_schedule
        }
        res = supabase.table("salons").insert(new_salon).execute()
        if not res.data: raise HTTPException(500, "Create failed")
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        logger.error(f"Reg error: {e}")
        raise HTTPException(500, detail=str(e))


@app.patch("/api/salons/{salon_id}")
async def update_salon_profile(salon_id: str, payload: SalonUpdate):
    try:
        res = supabase.table("salons").update(payload.dict(exclude_unset=True)).eq("id", salon_id).execute()
        if not res.data: raise HTTPException(404, "Not Found")
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@app.post("/api/services")
async def create_service(payload: ServiceCreate):
    try:
        data = payload.dict()
        data["is_active"] = True
        res = supabase.table("services").insert(data).execute()
        if not res.data: raise HTTPException(500, "Create failed")
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@app.delete("/api/services/{service_id}")
async def delete_service(service_id: str):
    try:
        res = supabase.table("services").update({"is_active": False}).eq("id", service_id).execute()
        if not res.data: raise HTTPException(404, "Not Found")
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@app.patch("/api/services/{service_id}")
async def update_service(service_id: str, payload: ServiceUpdate):
    try:
        res = supabase.table("services").update(payload.dict(exclude_unset=True)).eq("id", service_id).execute()
        if not res.data: raise HTTPException(404, "Not Found")
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


# --- Bot ---
@bot.message_handler(commands=['start'])
def handle_start(message):
    bot.reply_to(message, f"👋 Привет! Твой ID: `{message.chat.id}`", parse_mode="Markdown")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)