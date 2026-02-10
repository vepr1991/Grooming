# backend/app/reminders.py
import asyncio
from datetime import datetime, timedelta, timezone
from app.db import supabase
# [NEW] Импортируем escape_html
from app.utils import send_telegram_message, escape_html
import pytz


async def check_reminders():
    """
    Фоновая задача: проверяет записи и шлет напоминания за 5ч и 1ч.
    """
    print(f"[{datetime.now().strftime('%H:%M')}] Checking reminders...")

    try:
        # 1. Получаем все АКТИВНЫЕ (confirmed) записи на ближайшие 24 часа
        now_utc = datetime.now(timezone.utc)
        tomorrow_utc = now_utc + timedelta(days=1)

        res = supabase.table("appointments") \
            .select("*, services(name), masters(timezone, salon_name)") \
            .eq("status", "confirmed") \
            .gte("starts_at", now_utc.isoformat()) \
            .lte("starts_at", tomorrow_utc.isoformat()) \
            .execute()

        appointments = res.data

        for appt in appointments:
            await process_single_appointment(appt, now_utc)

    except Exception as e:
        print(f"Error in reminder loop: {e}")


async def process_single_appointment(appt, now_utc):
    try:
        start_time = datetime.fromisoformat(appt['starts_at'].replace('Z', '+00:00'))
    except ValueError:
        return

    time_left = start_time - now_utc
    total_seconds = time_left.total_seconds()
    hours_left = total_seconds / 3600

    client_id = appt['client_telegram_id']

    # [NEW] Экранируем данные перед вставкой в HTML
    raw_pet = appt.get('pet_name', 'питомца')
    pet_name = escape_html(raw_pet)

    raw_service = appt.get('services', {}).get('name', 'услугу') if appt.get('services') else 'услугу'
    service_name = escape_html(raw_service)

    raw_salon = appt.get('masters', {}).get('salon_name', 'Grooming Salon')
    salon_name = escape_html(raw_salon)

    tz_str = appt.get('masters', {}).get('timezone', 'Asia/Almaty')
    try:
        local_time = start_time.astimezone(pytz.timezone(tz_str)).strftime('%H:%M')
    except:
        local_time = start_time.strftime('%H:%M')

    # --- ЛОГИКА 5 ЧАСОВ ---
    if 4.5 <= hours_left <= 5.5 and not appt['reminder_5h_sent']:
        msg = (
            f"👋 Напоминаем!\n\n"
            f"Сегодня в <b>{local_time}</b> ждем <b>{pet_name}</b> на {service_name}.\n"
            f"📍 {salon_name}"
        )
        if await send_safe(client_id, msg):
            supabase.table("appointments").update({"reminder_5h_sent": True}).eq("id", appt['id']).execute()

    # --- ЛОГИКА 1 ЧАС ---
    elif 0.9 <= hours_left <= 1.5 and not appt['reminder_1h_sent']:
        msg = (
            f"⏳ Через час ждем вас!\n\n"
            f"<b>{pet_name}</b>, {service_name} в <b>{local_time}</b>.\n"
            f"Пожалуйста, не опаздывайте."
        )
        if await send_safe(client_id, msg):
            supabase.table("appointments").update({"reminder_1h_sent": True}).eq("id", appt['id']).execute()


async def send_safe(chat_id, text):
    """Обертка для отправки, чтобы не падать при ошибках сети"""
    try:
        send_telegram_message(chat_id, text)
        return True
    except Exception as e:
        print(f"Failed to send reminder to {chat_id}: {e}")
        return False