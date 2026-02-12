# (c) 2026 Владимир Коваленко. Все права защищены.
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from datetime import datetime, timedelta
import pytz
import uuid

from app.auth import get_current_user
from app.db import supabase
from app.utils import send_telegram_message, escape_html
from app.schemas.appointment import AppointmentCreate
from app.services.appointment_service import AppointmentService

router = APIRouter(tags=["Client"])


@router.get("/masters/{master_id}")
async def get_master_public_profile(master_id: int):
    res = supabase.table("masters").select(
        "salon_name, description, avatar_url, address, phone, timezone, photos, is_premium").eq("telegram_id",
                                                                                                master_id).execute()
    if not res.data: raise HTTPException(status_code=404, detail="Master not found")
    return res.data[0]


@router.get("/masters/{master_id}/services")
async def get_master_services(master_id: int):
    res = supabase.table("services").select("id, name, price, duration_min, description, category").eq(
        "master_telegram_id", master_id).eq("is_active", True).order("price").execute()
    return res.data


@router.get("/masters/{master_id}/availability")
async def get_master_availability(master_id: int, service_id: int, date: str):
    master_res = supabase.table("masters").select("timezone, is_premium").eq("telegram_id",
                                                                             master_id).single().execute()
    if not master_res.data: raise HTTPException(404, "Master not found")

    tz_name = master_res.data.get('timezone', 'Asia/Almaty')
    master_tz = pytz.timezone(tz_name)

    try:
        naive_date = datetime.strptime(date, "%Y-%m-%d")
        target_date_start = master_tz.localize(naive_date)
        target_date_end = target_date_start + timedelta(days=1) - timedelta(seconds=1)
    except:
        raise HTTPException(400, "Invalid date format")

    now_in_tz = datetime.now(master_tz)
    if target_date_end < now_in_tz: return []

    srv_res = supabase.table("services").select("duration_min").eq("id", service_id).single().execute()
    duration = srv_res.data.get('duration_min', 60) if srv_res.data else 60

    wh_res = supabase.table("working_hours").select("start_time, end_time, slot_minutes").eq("master_telegram_id",
                                                                                             master_id).eq(
        "day_of_week", target_date_start.isoweekday()).maybe_single().execute()
    if not wh_res.data: return []

    schedule = wh_res.data
    slot_step = schedule.get('slot_minutes', 30)

    work_start_dt = target_date_start.replace(hour=int(schedule['start_time'][:2]),
                                              minute=int(schedule['start_time'][3:5]))
    work_end_dt = target_date_start.replace(hour=int(schedule['end_time'][:2]), minute=int(schedule['end_time'][3:5]))

    if work_start_dt < now_in_tz:
        work_start_dt = now_in_tz + timedelta(minutes=(slot_step - now_in_tz.minute % slot_step))
        work_start_dt = work_start_dt.replace(second=0, microsecond=0)

    busy_res = supabase.table("appointments").select("starts_at, services(duration_min)").eq("master_telegram_id",
                                                                                             master_id).neq("status",
                                                                                                            "cancelled").gte(
        "starts_at", target_date_start.astimezone(pytz.utc).isoformat()).lt("starts_at", target_date_end.astimezone(
        pytz.utc).isoformat()).execute()

    busy_intervals = []
    for appt in busy_res.data:
        start = datetime.fromisoformat(appt['starts_at'].replace('Z', '+00:00')).astimezone(master_tz)
        dur = appt.get('services', {}).get('duration_min', 60) if appt.get('services') else 60
        busy_intervals.append((start, start + timedelta(minutes=dur)))

    free_slots = []
    current_slot = work_start_dt
    while current_slot + timedelta(minutes=duration) <= work_end_dt:
        slot_end = current_slot + timedelta(minutes=duration)
        if not any(max(current_slot, b_s) < min(slot_end, b_e) for b_s, b_e in busy_intervals):
            free_slots.append(current_slot.isoformat())
        current_slot += timedelta(minutes=slot_step)
    return free_slots


@router.post("/appointments")
async def create_appointment_public(app_data: AppointmentCreate, background_tasks: BackgroundTasks,
                                    user=Depends(get_current_user)):
    # pet_photos уже содержит ссылки от React
    new_appt = await AppointmentService.create(data=app_data, client_id=user['id'],
                                               client_username=user.get('username'))
    background_tasks.add_task(send_new_appointment_notification, new_appt)
    return new_appt


async def send_new_appointment_notification(new_appt: dict):
    try:
        msg = f"🆕 <b>Новая запись!</b>\n\n👤 Клиент: {escape_html(new_appt.get('client_name'))}\n🗓 Время: {new_appt['starts_at']}"
        await send_telegram_message(new_appt['master_telegram_id'], msg)
    except Exception as e:
        print(f"Error: {e}")