import hmac
import hashlib
import json
import pytz
from urllib.parse import unquote
from datetime import datetime, timedelta, timezone
from fastapi import Header, HTTPException
from telebot import types

from config import supabase, bot, logger, TELEGRAM_BOT_TOKEN
from schemas import BookingRequest


# --- AUTH ---
def verify_telegram_data(x_telegram_init_data: str = Header(None)) -> int | None:
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


# --- BUSINESS LOGIC ---
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


# --- NOTIFICATIONS ---
def send_telegram_notification_task(salon_id: str, data: BookingRequest, start_dt: datetime):
    try:
        res = supabase.table("salons").select("telegram_chat_id, name").eq("id", salon_id).single().execute()
        if not res.data: return
        chat_id = res.data.get("telegram_chat_id")

        services_list = ", ".join([s.title for s in data.services])

        # ИЗМЕНЕНИЕ: Динамическое построение дополнительных полей на основе metadata
        extra_info_lines = []
        meta = data.metadata or {}

        if meta.get("petName"):
            breed_str = f" ({meta.get('petBreed')})" if meta.get("petBreed") else ""
            extra_info_lines.append(f"🐶 <b>Питомец:</b> {meta.get('petName')}{breed_str}")

        extra_info_str = "\n".join(extra_info_lines) + "\n" if extra_info_lines else ""

        msg = (f"🔔 <b>Новая запись в {res.data.get('name')}!</b>\n\n"
               f"👤 <b>Клиент:</b> {data.client.name}\n"
               f"📞 <b>Тел:</b> {data.client.phone}\n"
               f"{extra_info_str}"  # Пустая строка, если это салон маникюра
               f"✂️ <b>Услуги:</b> {services_list}\n"
               f"📅 <b>Дата:</b> {start_dt.strftime('%d.%m.%Y')}\n"
               f"⏰ <b>Время:</b> {start_dt.strftime('%H:%M')}")

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
            f"✂️ <b>Салон:</b> {appt['salons']['name']}\n🛠 <b>Услуги:</b> {svc_title}\n"
            f"📅 <b>Дата:</b> {start_dt.strftime('%d.%m.%Y')}\n⏰ <b>Время:</b> {start_dt.strftime('%H:%M')}")

        if status_type == 'confirmed' and appt['salons'].get('phone'):
            msg += f"\n\n📞 <b>Телефон:</b> {appt['salons']['phone']}"

        # ИЗМЕНЕНИЕ: Добавляем кнопку отмены для подтвержденных записей
        markup = None
        if status_type == 'confirmed':
            markup = types.InlineKeyboardMarkup()
            markup.add(types.InlineKeyboardButton("❌ Отменить запись", callback_data=f"cancel_{appointment_id}"))

        bot.send_message(tg_user["id"], msg, parse_mode="HTML", reply_markup=markup)
    except Exception as e:
        logger.error(f"Client notify error: {e}")


async def check_upcoming_appointments():
    logger.info("⏰ Checking for reminders...")
    try:
        tz_local = pytz.timezone("Asia/Almaty")
        now_local = datetime.now(tz_local)

        target_time_start = now_local + timedelta(minutes=55)
        target_time_end = now_local + timedelta(minutes=65)

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

                svc_title = "Услуга"
                if appt.get('selected_services') and len(appt['selected_services']) > 0:
                    svc_title = ", ".join([s['title'] for s in appt['selected_services']])
                elif appt.get('services'):
                    svc_title = appt['services']['title']

                start_dt = datetime.fromisoformat(appt["start_time"].replace("Z", "+00:00"))
                start_dt_local = start_dt.astimezone(tz_local)

                time_str = start_dt_local.strftime('%H:%M')

                msg = (
                    f"⏰ <b>Напоминание!</b>\n\n"
                    f"Через час ({time_str}) у вас запись в <b>{appt['salons']['name']}</b>.\n"
                    f"✂️ {svc_title}\n\n"
                    f"<i>Ждем вас!</i>"
                )

                bot.send_message(client_id, msg, parse_mode="HTML")
                supabase.table("appointments").update({"reminder_sent": True}).eq("id", appt['id']).execute()

            except Exception as e:
                logger.error(f"Reminder error: {e}")

    except Exception as e:
        logger.error(f"Scheduler error: {e}")