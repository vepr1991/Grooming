import os
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

from fastapi import FastAPI, HTTPException, BackgroundTasks, Header, Depends, Request
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
ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID")
BACKEND_URL = os.getenv("BACKEND_URL")  # 👈 ОБЯЗАТЕЛЬНО ДОБАВИТЬ В ENV

if not all([SUPABASE_URL, SUPABASE_KEY, TELEGRAM_BOT_TOKEN]):
    logger.critical("⚠️ ОШИБКА: Не заданы переменные окружения!")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN)
scheduler = AsyncIOScheduler()


# --- 2. Жизненный цикл ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Настройка Webhook (вместо Polling)
    if BACKEND_URL and TELEGRAM_BOT_TOKEN:
        try:
            webhook_url = f"{BACKEND_URL}/api/webhook"
            logger.info(f"🔗 Setting webhook to: {webhook_url}")

            # Сбрасываем старый и ставим новый
            bot.remove_webhook()
            time.sleep(1)
            bot.set_webhook(url=webhook_url)
        except Exception as e:
            logger.error(f"❌ Webhook setup failed: {e}")
    else:
        logger.warning("⚠️ BACKEND_URL не задан! Бот не будет отвечать на сообщения.")

    # 2. Планировщик напоминаний
    if os.environ.get("RUN_SCHEDULER") != "false":
        logger.info("⏰ Starting scheduler...")
        scheduler.add_job(check_upcoming_appointments, 'interval', minutes=5)
        scheduler.start()

    yield

    # 3. Остановка (удаляем вебхук при выключении, чтобы не спамить ошибками)
    logger.info("🛑 Shutting down...")
    try:
        bot.remove_webhook()
        scheduler.shutdown()
    except Exception:
        pass


app = FastAPI(title="Grooming API", version="4.3", lifespan=lifespan)
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
    price: int
    duration_minutes: int = Field(..., gt=0)


class BookingRequest(BaseModel):
    salonId: str
    services: List[ServiceInfo]
    date: str
    time: str
    client: ClientInfo
    pet: PetInfo


class BlockRequest(BaseModel):
    salonId: str
    date: str
    time: str
    duration_minutes: int = Field(..., gt=0)
    reason: Optional[str] = "Перерыв"


class StatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|confirmed|completed|canceled|blocked)$")


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
    gallery: Optional[List[str]] = None
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
def check_overlap(salon_id: str, start_time: datetime, end_time: datetime) -> bool:
    try:
        res = supabase.table("appointments").select("id").eq("salon_id", salon_id) \
            .neq("status", "canceled").lt("start_time", end_time.isoformat()) \
            .gt("end_time", start_time.isoformat()).execute()
        return len(res.data) > 0
    except:
        return True


def validate_working_hours(salon_id: str, start_dt: datetime, end_dt: datetime):
    try:
        res = supabase.table("salons").select("schedule").eq("id", salon_id).single().execute()
        if not res.data or not res.data.get('schedule'): return

        schedule = json.loads(res.data['schedule'])
        days_map = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
        day_key = days_map[start_dt.weekday()]

        day_sched = next((d for d in schedule if d["day"] == day_key), None)

        if not day_sched or not day_sched.get("isWorking"):
            raise HTTPException(400, f"Салон не работает в {day_key}")

        work_start = datetime.strptime(day_sched["hours"]["start"], "%H:%M").time()
        work_end = datetime.strptime(day_sched["hours"]["end"], "%H:%M").time()

        req_start = start_dt.time()
        req_end = end_dt.time()

        if req_start < work_start or req_end > work_end:
            raise HTTPException(400, "Время выходит за рамки рабочего графика")

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Schedule check error: {e}")


async def check_upcoming_appointments():
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
                tg_user = json.loads(tg_user_raw) if isinstance(tg_user_raw, str) else tg_user_raw
                client_id = tg_user.get("id")
                if not client_id: continue

                svc_title = "Услуга"
                if appt.get('selected_services') and len(appt['selected_services']) > 0:
                    svc_title = ", ".join([s['title'] for s in appt['selected_services']])
                elif appt.get('services'):
                    svc_title = appt['services']['title']

                start_dt = datetime.fromisoformat(appt["start_time"].replace("Z", "+00:00"))
                time_str = start_dt.strftime('%H:%M')
                msg = (
                    f"⏰ <b>Напоминание!</b>\n\nЧерез час ({time_str}) у вас запись в <b>{appt['salons']['name']}</b>.\n"
                    f"✂️ {svc_title}\n\n<i>Ждем вас!</i>")
                bot.send_message(client_id, msg, parse_mode="HTML")
                supabase.table("appointments").update({"reminder_sent": True}).eq("id", appt['id']).execute()
            except Exception as e:
                logger.error(f"Reminder error: {e}")
    except Exception as e:
        logger.error(f"Scheduler error: {e}")


def send_telegram_notification_task(salon_id: str, data: BookingRequest, start_dt: datetime):
    try:
        res = supabase.table("salons").select("telegram_chat_id, name").eq("id", salon_id).single().execute()
        if not res.data: return
        chat_id = res.data.get("telegram_chat_id")

        services_list = ", ".join([s.title for s in data.services])
        pet_info = f"{data.pet.name}" + (f" ({data.pet.petBreed})" if data.pet.petBreed else "")

        msg = (f"🔔 <b>Новая запись в {res.data.get('name')}!</b>\n\n👤 <b>Клиент:</b> {data.client.name}\n"
               f"📞 <b>Тел:</b> {data.client.phone}\n🐶 <b>Питомец:</b> {pet_info}\n✂️ <b>Услуги:</b> {services_list}\n"
               f"📅 <b>Дата:</b> {start_dt.strftime('%d.%m.%Y')}\n⏰ <b>Время:</b> {start_dt.strftime('%H:%M')}")
        markup = types.InlineKeyboardMarkup()
        markup.add(types.InlineKeyboardButton("Открыть админку", web_app=types.WebAppInfo(
            url="https://grooming-react-front.onrender.com/master")))
        bot.send_message(chat_id, msg, parse_mode="HTML", reply_markup=markup)
    except Exception as e:
        logger.error(f"Notify error: {e}")


def send_client_notification(appointment_id: str, status_type: str):
    try:
        res = supabase.table("appointments").select("*, salons(name, phone), services(title)").eq("id",
                                                                                                  appointment_id).single().execute()
        if not res.data: return
        appt = res.data
        if not appt.get("client_tg_user"): return

        tg_user = json.loads(appt["client_tg_user"]) if isinstance(appt["client_tg_user"], str) else appt[
            "client_tg_user"]
        if not tg_user or not tg_user.get("id"): return

        start_dt = datetime.fromisoformat(appt["start_time"].replace("Z", "+00:00"))

        svc_title = "Услуга"
        if appt.get('selected_services') and len(appt['selected_services']) > 0:
            svc_title = ", ".join([s['title'] for s in appt['selected_services']])
        elif appt.get('services'):
            svc_title = appt['services']['title']

        msg = (
            f"{'✅' if status_type == 'confirmed' else '❌'} <b>Запись {'подтверждена' if status_type == 'confirmed' else 'отменена'}</b>\n\n"
            f"✂️ <b>Салон:</b> {appt['salons']['name']}\n🛠 <b>Услуга:</b> {svc_title}\n"
            f"📅 <b>Дата:</b> {start_dt.strftime('%d.%m.%Y')}\n⏰ <b>Время:</b> {start_dt.strftime('%H:%M')}")
        if status_type == 'confirmed' and appt['salons'].get('phone'):
            msg += f"\n\n📞 <b>Телефон:</b> {appt['salons']['phone']}"
        bot.send_message(tg_user["id"], msg, parse_mode="HTML")
    except Exception as e:
        logger.error(f"Client notify error: {e}")


# --- API Endpoints ---
@app.get("/")
def health_check(): return {"status": "active", "version": "4.3"}


# 👇 НОВЫЙ ЭНДПОИНТ: Сюда Телеграм будет слать обновления
@app.post("/api/webhook")
def process_webhook(update: dict):
    """
    Принимает обновления от Telegram (Webhook)
    Используем синхронный def, чтобы FastAPI запустил это в отдельном потоке
    и не блокировал event loop тяжелыми запросами Telebot к Supabase.
    """
    if update:
        update_obj = telebot.types.Update.de_json(update)
        bot.process_new_updates([update_obj])
    return {"status": "ok"}


@app.get("/api/user-status/{tg_id}")
async def check_user_status(tg_id: int):
    res = supabase.table("salons").select("id, is_approved").eq("telegram_chat_id", tg_id).execute()
    if res.data:
        return {
            "isMaster": True,
            "salonId": res.data[0]['id'],
            "isApproved": res.data[0].get('is_approved', False)
        }
    return {"isMaster": False}


@app.get("/api/analytics/{salon_id}")
async def get_analytics(salon_id: str, tg_user_id: Optional[int] = Depends(verify_telegram_data)):
    if tg_user_id:
        check = supabase.table("salons").select("id").eq("id", salon_id).eq("telegram_chat_id", tg_user_id).execute()
        if not check.data: raise HTTPException(403, "Forbidden")
    try:
        today = datetime.now()
        start_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        res = supabase.table("appointments").select("*, services(id, title, price)").eq("salon_id", salon_id).gte(
            "start_time", start_month).execute()
        apps = res.data or []

        total_rev, today_rev, comp, canc = 0, 0, 0, 0
        daily_map, services_usage = {}, {}
        today_str = today.strftime('%Y-%m-%d')

        for app in apps:
            if app['status'] == 'completed':
                comp += 1
                app_price = 0
                selected = app.get('selected_services')

                if selected and isinstance(selected, list) and len(selected) > 0:
                    for s in selected:
                        p = s.get('price', 0)
                        app_price += p
                        sid = s.get('id', 'unknown')
                        stitle = s.get('title', 'Unknown')
                        services_usage[sid] = services_usage.get(sid, {"title": stitle, "count": 0})
                        services_usage[sid]["count"] += 1
                elif app.get('services'):
                    s = app['services']
                    app_price = s['price']
                    services_usage[s['id']] = services_usage.get(s['id'], {"title": s['title'], "count": 0})
                    services_usage[s['id']]["count"] += 1

                total_rev += app_price
                d_str = app['start_time'][:10]
                daily_map[d_str] = daily_map.get(d_str, 0) + app_price
                if d_str == today_str: today_rev += app_price

            elif app['status'] == 'canceled':
                canc += 1

        top_services = sorted(services_usage.values(), key=lambda x: x['count'], reverse=True)[:3]
        daily_stats = [{"date": datetime.strptime(k, "%Y-%m-%d").strftime("%d.%m"), "value": v} for k, v in
                       sorted(daily_map.items())]

        return {"total_revenue": total_rev, "total_appointments": len(apps), "completed_count": comp,
                "canceled_count": canc, "today_revenue": today_rev, "daily_stats": daily_stats,
                "top_services": top_services}
    except Exception as e:
        logger.error(f"Analytics error: {e}")
        raise HTTPException(500, str(e))


@app.get("/api/clients/{salon_id}")
async def get_salon_clients(salon_id: str, tg_user_id: Optional[int] = Depends(verify_telegram_data)):
    if tg_user_id:
        check = supabase.table("salons").select("id").eq("id", salon_id).eq("telegram_chat_id", tg_user_id).execute()
        if not check.data: raise HTTPException(403, "Forbidden")
    try:
        res = supabase.table("appointments").select("*").eq("salon_id", salon_id).order("start_time",
                                                                                        desc=True).execute()
        apps = res.data or []
        clients_dict = {}
        for app in apps:
            phone = app.get('client_phone')
            if not phone: continue
            if phone not in clients_dict:
                clients_dict[phone] = {
                    "name": app['client_name'],
                    "phone": phone,
                    "pet_name": app['pet_name'],
                    "pet_breed": app['pet_breed'],
                    "total_visits": 0,
                    "last_visit": app['start_time'],
                    "tg_user": app.get('client_tg_user')
                }
            if app['status'] == 'completed': clients_dict[phone]["total_visits"] += 1
            if app['start_time'] > clients_dict[phone]["last_visit"]: clients_dict[phone]["last_visit"] = app[
                'start_time']
        return sorted(clients_dict.values(), key=lambda x: x['last_visit'], reverse=True)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/book")
async def create_booking(data: BookingRequest, background_tasks: BackgroundTasks):
    total_duration = sum(s.duration_minutes for s in data.services)
    start_dt = datetime.fromisoformat(f"{data.date}T{data.time}:00")
    end_dt = start_dt + timedelta(minutes=total_duration)

    validate_working_hours(data.salonId, start_dt, end_dt)
    if check_overlap(data.salonId, start_dt, end_dt): raise HTTPException(409, "Slot taken")

    selected_services_json = [s.dict() for s in data.services]
    primary_service_id = data.services[0].id if data.services else None

    payload = {
        "salon_id": data.salonId,
        "service_id": primary_service_id,
        "client_name": data.client.name,
        "client_phone": data.client.phone,
        "client_tg_user": json.dumps(data.client.telegram_user),
        "pet_name": data.pet.name,
        "pet_breed": data.pet.petBreed,
        "start_time": start_dt.isoformat(),
        "end_time": end_dt.isoformat(),
        "status": "pending",
        "selected_services": selected_services_json
    }

    res = supabase.table("appointments").insert(payload).execute()
    background_tasks.add_task(send_telegram_notification_task, data.salonId, data, start_dt)
    return {"success": True, "id": res.data[0]['id']}


@app.post("/api/block")
async def block_slot(data: BlockRequest, tg_user_id: Optional[int] = Depends(verify_telegram_data)):
    if tg_user_id:
        check = supabase.table("salons").select("id").eq("id", data.salonId).eq("telegram_chat_id",
                                                                                tg_user_id).execute()
        if not check.data: raise HTTPException(403, "Forbidden")

    start_dt = datetime.fromisoformat(f"{data.date}T{data.time}:00")
    end_dt = start_dt + timedelta(minutes=data.duration_minutes)

    if check_overlap(data.salonId, start_dt, end_dt): raise HTTPException(409, "Slot taken")

    payload = {
        "salon_id": data.salonId,
        "client_name": data.reason,
        "start_time": start_dt.isoformat(),
        "end_time": end_dt.isoformat(),
        "status": "blocked",
    }

    res = supabase.table("appointments").insert(payload).execute()
    return {"success": True, "id": res.data[0]['id']}


@app.patch("/api/appointments/{appointment_id}/status")
async def update_status(appointment_id: str, payload: StatusUpdate, background_tasks: BackgroundTasks):
    res = supabase.table("appointments").update({"status": payload.status}).eq("id", appointment_id).execute()
    if payload.status in ['confirmed', 'canceled']: background_tasks.add_task(send_client_notification, appointment_id,
                                                                              payload.status)
    return {"success": True, "data": res.data[0]}


@app.post("/api/register")
async def register_salon(p: SalonCreate):
    existing = supabase.table("salons").select("*").eq("telegram_chat_id", p.telegram_chat_id).execute()
    if existing.data: return {"success": True, "data": existing.data[0]}

    new_s = p.dict()
    new_s.update({
        "slug": f"s_{p.telegram_chat_id}_{int(time.time())}",
        "is_active": True,
        "is_approved": False,
        "schedule": json.dumps(
            [{"day": d, "isWorking": d not in ["Сб", "Вс"], "hours": {"start": "10:00", "end": "20:00"}} for d in
             ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]])
    })

    res = supabase.table("salons").insert(new_s).execute()
    new_salon = res.data[0]

    if ADMIN_CHAT_ID:
        try:
            markup = types.InlineKeyboardMarkup()
            markup.row(
                types.InlineKeyboardButton("✅ Одобрить", callback_data=f"approve_{new_salon['id']}"),
                types.InlineKeyboardButton("❌ Отклонить", callback_data=f"reject_{new_salon['id']}")
            )
            msg_text = (
                f"🚨 <b>Новая регистрация!</b>\n\n"
                f"👤 Имя: {new_salon['name']}\n"
                f"📍 Адрес: {new_salon.get('address', 'Не указан')}\n"
                f"📞 Тел: {new_salon.get('phone', 'Не указан')}\n"
                f"🆔 TG ID: <code>{p.telegram_chat_id}</code>"
            )
            bot.send_message(ADMIN_CHAT_ID, msg_text, parse_mode="HTML", reply_markup=markup)
        except Exception as e:
            logger.error(f"Failed to notify admin: {e}")

    return {"success": True, "data": new_salon}


@app.patch("/api/salons/{salon_id}")
async def update_salon(salon_id: str, p: SalonUpdate, uid: Optional[int] = Depends(verify_telegram_data)):
    if uid and not supabase.table("salons").select("id").eq("id", salon_id).eq("telegram_chat_id",
                                                                               uid).execute().data: raise HTTPException(
        403)
    res = supabase.table("salons").update(p.dict(exclude_unset=True)).eq("id", salon_id).execute()
    return {"success": True, "data": res.data[0]}


@app.post("/api/services")
async def create_svc(p: ServiceCreate, uid: Optional[int] = Depends(verify_telegram_data)):
    if uid and not supabase.table("salons").select("id").eq("id", p.salon_id).eq("telegram_chat_id",
                                                                                 uid).execute().data: raise HTTPException(
        403)
    res = supabase.table("services").insert({**p.dict(), "is_active": True}).execute()
    return {"success": True, "data": res.data[0]}


@app.delete("/api/services/{sid}")
async def del_svc(sid: str, uid: Optional[int] = Depends(verify_telegram_data)):
    svc = supabase.table("services").select("salon_id").eq("id", sid).single().execute()
    if uid and svc.data and not supabase.table("salons").select("id").eq("id", svc.data['salon_id']).eq(
            "telegram_chat_id", uid).execute().data: raise HTTPException(403)
    supabase.table("services").update({"is_active": False}).eq("id", sid).execute()
    return {"success": True}


@app.patch("/api/services/{sid}")
async def up_svc(sid: str, p: ServiceUpdate):
    res = supabase.table("services").update(p.dict(exclude_unset=True)).eq("id", sid).execute()
    return {"success": True, "data": res.data[0]}


# --- Bot Handlers ---
@bot.message_handler(commands=['start'])
def h_start(m):
    # Кнопка для открытия WebApp
    markup = types.InlineKeyboardMarkup()
    markup.add(types.InlineKeyboardButton("🚀 Открыть приложение",
                                          web_app=types.WebAppInfo("https://grooming-tma.onrender.com")))
    bot.reply_to(m, f"Привет! Я бот для записи на груминг.\nЖми кнопку ниже 👇", reply_markup=markup)


@bot.callback_query_handler(func=lambda call: call.data.startswith('approve_') or call.data.startswith('reject_'))
def handle_admin_decision(call):
    if str(call.message.chat.id) != str(ADMIN_CHAT_ID): return

    action, salon_id = call.data.split('_')

    try:
        salon_res = supabase.table("salons").select("telegram_chat_id, name").eq("id", salon_id).single().execute()
        if not salon_res.data:
            bot.answer_callback_query(call.id, "Салон не найден")
            return

        master_chat_id = salon_res.data['telegram_chat_id']

        if action == 'approve':
            supabase.table("salons").update({"is_approved": True}).eq("id", salon_id).execute()
            bot.edit_message_text(f"✅ Мастер <b>{salon_res.data['name']}</b> одобрен!", call.message.chat.id,
                                  call.message.id, parse_mode="HTML")
            bot.send_message(master_chat_id, "🎉 <b>Ваш аккаунт подтвержден!</b>\n\nТеперь вы можете принимать записи.",
                             parse_mode="HTML")

        elif action == 'reject':
            bot.edit_message_text(f"❌ Мастер <b>{salon_res.data['name']}</b> отклонен.", call.message.chat.id,
                                  call.message.id, parse_mode="HTML")
            bot.send_message(master_chat_id, "😔 К сожалению, ваша регистрация отклонена администратором.")

    except Exception as e:
        logger.error(f"Approval error: {e}")
        bot.answer_callback_query(call.id, "Ошибка обработки")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))