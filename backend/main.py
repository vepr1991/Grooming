import os
import threading
import logging
import json
import time
import re
import hmac
import hashlib
from urllib.parse import unquote
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from supabase import create_client, Client
import telebot
from telebot import types
from apscheduler.schedulers.asyncio import AsyncIOScheduler

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
scheduler = AsyncIOScheduler()


# --- 2. Жизненный цикл ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.environ.get("RUN_BOT") != "false":
        logger.info("🚀 Запуск сервера, бота и планировщика...")
        threading.Thread(target=start_bot_polling, daemon=True).start()
        scheduler.add_job(check_upcoming_appointments, 'interval', minutes=5)
        scheduler.start()
    yield
    logger.info("🛑 Остановка сервера...")
    try:
        bot.stop_polling()
        scheduler.shutdown()
    except Exception:
        pass


app = FastAPI(title="Grooming API", version="3.7", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# --- 3. Модели данных ---
class ClientInfo(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    phone: str = Field(..., min_length=5, max_length=20)
    telegram_user: Optional[Dict[str, Any]] = None

    @validator('phone')
    def v_phone(cls, v):
        if not re.match(r'^[\d\+\-\(\)\s]+$', v): raise ValueError('Bad phone')
        return v


class PetInfo(BaseModel):
    name: str = Field(..., min_length=1, max_length=30)
    petBreed: Optional[str] = Field(default="", max_length=50)


class ServiceInfo(BaseModel):
    id: str
    title: str
    duration_minutes: int = Field(..., gt=0)


class BookingRequest(BaseModel):
    salonId: str
    service: ServiceInfo
    date: str
    time: str
    client: ClientInfo
    pet: PetInfo


class StatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|confirmed|completed|canceled)$")


class SalonCreate(BaseModel):
    telegram_chat_id: int
    name: str = Field(..., min_length=2, max_length=50)
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
    title: str = Field(..., min_length=2, max_length=50)
    description: Optional[str] = ""
    price: int = Field(..., ge=0)
    duration_minutes: int = Field(..., gt=0)
    image_url: Optional[str] = None


class ServiceUpdate(BaseModel):
    title: Optional[str] = None
    price: Optional[int] = None
    duration_minutes: Optional[int] = None
    description: Optional[str] = None
    image_url: Optional[str] = None


# --- 4. Безопасность (AUTH) ---
def verify_telegram_data(x_telegram_init_data: str = Header(None)) -> Optional[int]:
    if not x_telegram_init_data: return None
    try:
        data_dict = {}
        for part in x_telegram_init_data.split('&'):
            if '=' in part:
                key, value = part.split('=', 1)
                data_dict[key] = unquote(value)
        received_hash = data_dict.pop('hash', '')
        if not received_hash: return None
        data_check_string = '\n'.join([f'{k}={v}' for k, v in sorted(data_dict.items())])
        secret_key = hmac.new(b"WebAppData", TELEGRAM_BOT_TOKEN.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        if calculated_hash != received_hash: return None
        user_data = json.loads(data_dict.get('user', '{}'))
        return user_data.get('id')
    except Exception as e:
        logger.error(f"Auth error: {e}")
        return None


# --- 5. Вспомогательные функции ---

def start_bot_polling():
    try:
        bot.remove_webhook()
        time.sleep(1)
        logger.info("🤖 Bot started polling...")
        bot.infinity_polling(timeout=10, long_polling_timeout=5)
    except Exception:
        pass


def check_overlap(salon_id: str, start_time: datetime, end_time: datetime) -> bool:
    try:
        res = supabase.table("appointments").select("id").eq("salon_id", salon_id) \
            .neq("status", "canceled").lt("start_time", end_time.isoformat()) \
            .gt("end_time", start_time.isoformat()).execute()
        return len(res.data) > 0
    except:
        return True


async def check_upcoming_appointments():
    """Планировщик напоминаний"""
    logger.info("⏰ Checking for reminders...")
    try:
        now_utc = datetime.now(timezone.utc)
        target_time_start = now_utc + timedelta(minutes=55)
        target_time_end = now_utc + timedelta(minutes=65)

        response = supabase.table("appointments") \
            .select("*, salons(name, phone), services(title)") \
            .eq("status", "confirmed") \
            .eq("reminder_sent", False) \
            .gte("start_time", target_time_start.isoformat()) \
            .lte("start_time", target_time_end.isoformat()) \
            .execute()

        appointments = response.data or []

        for appt in appointments:
            try:
                tg_user_raw = appt.get("client_tg_user")
                if not tg_user_raw: continue
                tg_user = tg_user_raw
                if isinstance(tg_user_raw, str):
                    try:
                        tg_user = json.loads(tg_user_raw)
                    except:
                        continue
                client_id = tg_user.get("id")
                if not client_id: continue

                start_dt = datetime.fromisoformat(appt["start_time"].replace("Z", "+00:00"))
                time_str = start_dt.strftime('%H:%M')
                salon_name = appt['salons']['name']
                service_title = appt['services']['title']

                msg = (
                    f"⏰ <b>Напоминание!</b>\n\n"
                    f"Через час ({time_str}) у вас запись в <b>{salon_name}</b>.\n"
                    f"✂️ Услуга: {service_title}\n\n"
                    f"<i>Ждем вас!</i>"
                )
                bot.send_message(client_id, msg, parse_mode="HTML")
                supabase.table("appointments").update({"reminder_sent": True}).eq("id", appt['id']).execute()
                logger.info(f"Reminder sent to {client_id}")
            except Exception as e:
                logger.error(f"Reminder error: {e}")
    except Exception as e:
        logger.error(f"Scheduler error: {e}")


def send_telegram_notification_task(salon_id: str, data: BookingRequest, start_dt: datetime):
    """Уведомление МАСТЕРУ"""
    try:
        res = supabase.table("salons").select("telegram_chat_id, name").eq("id", salon_id).single().execute()
        if not res.data: return
        master_chat_id = res.data.get("telegram_chat_id")
        salon_name = res.data.get("name")

        if master_chat_id:
            pet_info = f"{data.pet.name}"
            if data.pet.petBreed: pet_info += f" ({data.pet.petBreed})"

            msg = (
                f"🔔 <b>Новая запись в {salon_name}!</b>\n\n"
                f"👤 <b>Клиент:</b> {data.client.name}\n"
                f"📞 <b>Тел:</b> {data.client.phone}\n"
                f"🐶 <b>Питомец:</b> {pet_info}\n"
                f"✂️ <b>Услуга:</b> {data.service.title}\n"
                f"📅 <b>Дата:</b> {start_dt.strftime('%d.%m.%Y')}\n"
                f"⏰ <b>Время:</b> {start_dt.strftime('%H:%M')}\n\n"
                f"<i>Зайдите в приложение для подтверждения.</i>"
            )
            markup = types.InlineKeyboardMarkup()
            FRONTEND_URL = "https://grooming-react-front.onrender.com"
            markup.add(
                types.InlineKeyboardButton("Открыть админку", web_app=types.WebAppInfo(url=f"{FRONTEND_URL}/master")))
            bot.send_message(master_chat_id, msg, parse_mode="HTML", reply_markup=markup)
    except Exception as e:
        logger.error(f"Master notify error: {e}")


def send_client_notification(appointment_id: str, status_type: str):
    """Уведомление КЛИЕНТУ (Подробное)"""
    try:
        res = supabase.table("appointments").select("*, salons(name, phone), services(title)").eq("id",
                                                                                                  appointment_id).single().execute()
        if not res.data: return
        appt = res.data

        tg_user = appt.get("client_tg_user")
        if tg_user and isinstance(tg_user, str):
            try:
                tg_user = json.loads(tg_user)
            except:
                tg_user = None

        if not tg_user or not tg_user.get("id"): return

        start_dt = datetime.fromisoformat(appt["start_time"].replace("Z", "+00:00"))
        date_str = start_dt.strftime('%d.%m.%Y')
        time_str = start_dt.strftime('%H:%M')
        salon_name = appt['salons']['name']
        salon_phone = appt['salons'].get('phone', '')
        service_title = appt['services']['title']

        msg = ""

        if status_type == 'confirmed':
            msg = (
                f"✅ <b>Ваша запись подтверждена!</b>\n\n"
                f"✂️ <b>Салон:</b> {salon_name}\n"
                f"🛠 <b>Услуга:</b> {service_title}\n"
                f"📅 <b>Дата:</b> {date_str}\n"
                f"⏰ <b>Время:</b> {time_str}"
            )
            if salon_phone:
                msg += f"\n\n📞 <b>Телефон для связи:</b> {salon_phone}"

        elif status_type == 'canceled':
            msg = (
                f"❌ <b>Ваша запись отменена</b>\n\n"
                f"✂️ <b>Салон:</b> {salon_name}\n"
                f"🛠 <b>Услуга:</b> {service_title}\n"
                f"📅 <b>Дата:</b> {date_str}\n"
                f"⏰ <b>Время:</b> {time_str}\n\n"
                f"<i>Приносим извинения.</i>"
            )

        if msg:
            bot.send_message(tg_user.get("id"), msg, parse_mode="HTML")

    except Exception as e:
        logger.error(f"Client notify error: {e}")


# --- 6. API Endpoints ---

@app.get("/")
def health_check(): return {"status": "active", "service": "Grooming Backend v3.7 (Analytics)"}


@app.get("/api/user-status/{tg_id}")
async def check_user_status(tg_id: int):
    try:
        res = supabase.table("salons").select("id").eq("telegram_chat_id", tg_id).execute()
        return {"isMaster": True, "salonId": res.data[0]['id']} if res.data else {"isMaster": False}
    except:
        return {"isMaster": False}


@app.post("/api/book")
async def create_booking(data: BookingRequest, background_tasks: BackgroundTasks):
    try:
        start_dt = datetime.fromisoformat(f"{data.date}T{data.time}:00")
        end_dt = start_dt + timedelta(minutes=data.service.duration_minutes)
        if check_overlap(data.salonId, start_dt, end_dt): raise HTTPException(409, "Slot taken")

        client_tg_json = json.dumps(data.client.telegram_user) if data.client.telegram_user else None
        payload = {
            "salon_id": data.salonId, "service_id": data.service.id,
            "client_name": data.client.name, "client_phone": data.client.phone,
            "client_tg_user": client_tg_json, "pet_name": data.pet.name, "pet_breed": data.pet.petBreed,
            "start_time": start_dt.isoformat(), "end_time": end_dt.isoformat(), "status": "pending"
        }
        res = supabase.table("appointments").insert(payload).execute()
        if not res.data: raise HTTPException(500, "DB Error")

        background_tasks.add_task(send_telegram_notification_task, data.salonId, data, start_dt)
        return {"success": True, "id": res.data[0]['id']}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Book: {e}")
        raise HTTPException(500, "Server Error")


# 👇 АНАЛИТИКА (НОВЫЙ ЭНДПОИНТ) 👇
@app.get("/api/analytics/{salon_id}")
async def get_analytics(salon_id: str, tg_user_id: Optional[int] = Depends(verify_telegram_data)):
    # 🔐 Проверка владельца
    if tg_user_id:
        check = supabase.table("salons").select("id").eq("id", salon_id).eq("telegram_chat_id", tg_user_id).execute()
        if not check.data: raise HTTPException(403, "Forbidden")

    try:
        # Начало текущего месяца
        today = datetime.now()
        start_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

        # Получаем записи за месяц
        res = supabase.table("appointments").select("*, services(price)").eq("salon_id", salon_id).gte("start_time",
                                                                                                       start_month).execute()
        apps = res.data or []

        total_revenue = 0
        completed = 0
        canceled = 0
        today_revenue = 0
        daily_map = {}
        today_str = today.strftime('%Y-%m-%d')

        for app in apps:
            if app['status'] == 'completed':
                completed += 1
                price = app['services']['price'] if app.get('services') else 0
                total_revenue += price

                d_str = app['start_time'][:10]
                daily_map[d_str] = daily_map.get(d_str, 0) + price

                if d_str == today_str: today_revenue += price
            elif app['status'] == 'canceled':
                canceled += 1

        daily_stats = [{"date": datetime.strptime(k, "%Y-%m-%d").strftime("%d.%m"), "value": v} for k, v in
                       sorted(daily_map.items())]

        return {
            "total_revenue": total_revenue,
            "total_appointments": len(apps),
            "completed_count": completed,
            "canceled_count": canceled,
            "today_revenue": today_revenue,
            "daily_stats": daily_stats
        }
    except Exception as e:
        logger.error(f"Analytics error: {e}")
        raise HTTPException(500, str(e))


# --- ЗАЩИЩЕННЫЕ МЕТОДЫ ---

@app.post("/api/register")
async def register_salon(payload: SalonCreate):
    try:
        existing = supabase.table("salons").select("id").eq("telegram_chat_id", payload.telegram_chat_id).execute()
        if existing.data: return {"success": True, "data": existing.data[0], "message": "Exists"}

        slug_val = f"salon_{payload.telegram_chat_id}_{int(time.time())}"
        sched = json.dumps(
            [{"day": d, "isWorking": d not in ["Сб", "Вс"], "hours": {"start": "10:00", "end": "20:00"}} for d in
             ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]])

        new_salon = payload.dict()
        new_salon.update({"slug": slug_val, "is_active": True, "schedule": sched})

        res = supabase.table("salons").insert(new_salon).execute()
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.patch("/api/salons/{salon_id}")
async def update_salon_profile(salon_id: str, payload: SalonUpdate,
                               tg_user_id: Optional[int] = Depends(verify_telegram_data)):
    if tg_user_id:
        check = supabase.table("salons").select("id").eq("id", salon_id).eq("telegram_chat_id", tg_user_id).execute()
        if not check.data: raise HTTPException(403, "Forbidden")

    try:
        res = supabase.table("salons").update(payload.dict(exclude_unset=True)).eq("id", salon_id).execute()
        if not res.data: raise HTTPException(404, "Not Found")
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/services")
async def create_service(payload: ServiceCreate, tg_user_id: Optional[int] = Depends(verify_telegram_data)):
    if tg_user_id:
        check = supabase.table("salons").select("id").eq("id", payload.salon_id).eq("telegram_chat_id",
                                                                                    tg_user_id).execute()
        if not check.data: raise HTTPException(403, "Forbidden")

    try:
        data = payload.dict()
        data["is_active"] = True
        res = supabase.table("services").insert(data).execute()
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.delete("/api/services/{service_id}")
async def delete_service(service_id: str, tg_user_id: Optional[int] = Depends(verify_telegram_data)):
    try:
        service_res = supabase.table("services").select("salon_id").eq("id", service_id).single().execute()
        if service_res.data and tg_user_id:
            salon_check = supabase.table("salons").select("id").eq("id", service_res.data['salon_id']).eq(
                "telegram_chat_id", tg_user_id).execute()
            if not salon_check.data: raise HTTPException(403, "Forbidden")

        res = supabase.table("services").update({"is_active": False}).eq("id", service_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.patch("/api/services/{service_id}")
async def update_service(service_id: str, payload: ServiceUpdate,
                         tg_user_id: Optional[int] = Depends(verify_telegram_data)):
    try:
        res = supabase.table("services").update(payload.dict(exclude_unset=True)).eq("id", service_id).execute()
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.patch("/api/appointments/{appointment_id}/status")
async def update_appointment_status(appointment_id: str, payload: StatusUpdate, background_tasks: BackgroundTasks):
    try:
        res = supabase.table("appointments").update({"status": payload.status}).eq("id", appointment_id).execute()
        if not res.data: raise HTTPException(404, "Not Found")

        if payload.status in ['confirmed', 'canceled']:
            background_tasks.add_task(send_client_notification, appointment_id, payload.status)
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        raise HTTPException(500, str(e))


# --- Bot ---
@bot.message_handler(commands=['start'])
def handle_start(message):
    bot.reply_to(message, f"👋 ID: `{message.chat.id}`", parse_mode="Markdown")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)