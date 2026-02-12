# (c) 2026 Владимир Коваленко. Все права защищены.
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from datetime import datetime, timedelta
import pytz

from app.auth import get_current_user
from app.db import supabase
from app.utils import send_telegram_message, escape_html
from app.schemas.appointment import AppointmentCreate
from app.services.appointment_service import AppointmentService

router = APIRouter(tags=["Client"])


@router.get("/masters/{master_id}")
async def get_master_public_profile(master_id: int):
    res = supabase.table("masters") \
        .select("salon_name, description, avatar_url, address, phone, timezone, photos, is_premium") \
        .eq("telegram_id", master_id) \
        .execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Master not found")
    return res.data[0]


@router.get("/masters/{master_id}/services")
async def get_master_services(master_id: int):
    res = supabase.table("services") \
        .select("id, name, price, duration_min, description, category") \
        .eq("master_telegram_id", master_id) \
        .eq("is_active", True) \
        .order("price") \
        .execute()
    return res.data


@router.post("/appointments")
async def create_appointment_public(
        app_data: AppointmentCreate,
        background_tasks: BackgroundTasks,
        user=Depends(get_current_user)
):
    # Теперь мы НЕ обрабатываем фото здесь.
    # Ссылки уже лежат в app_data.pet_photos, так как их прислал React.

    new_appt = await AppointmentService.create(
        data=app_data,
        client_id=user['id'],
        client_username=user.get('username')
    )

    background_tasks.add_task(send_new_appointment_notification, new_appt)
    return new_appt


async def send_new_appointment_notification(new_appt: dict):
    # Логика уведомлений мастера (оставляем для работы бота)
    try:
        service_name = "Услуга"
        srv_res = supabase.table("services").select("name").eq("id", new_appt['service_id']).single().execute()
        if srv_res.data:
            service_name = escape_html(srv_res.data.get('name', 'Услуга'))

        msg = (
            f"🆕 <b>Новая запись!</b>\n\n"
            f"👤 Клиент: {escape_html(new_appt.get('client_name', 'Не указано'))}\n"
            f"📞 Телефон: {escape_html(new_appt.get('client_phone'))}\n"
            f"✂️ Услуга: {service_name}\n"
            f"🗓 Время: {new_appt['starts_at']}"
        )
        await send_telegram_message(new_appt['master_telegram_id'], msg)
    except Exception as e:
        print(f"Background notify error: {e}")