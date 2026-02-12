from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from typing import List
from datetime import datetime
import pytz
import uuid
import httpx

from app.auth import validate_telegram_data
from app.db import supabase
from app.utils import send_telegram_message, compress_image, escape_html
from app.config import settings  # <--- [FIX] 1. Импортируем settings
from app.schemas.master import (
    MasterProfileUpdate, ServiceCreate, ServiceUpdate, WorkingHourItem
)

router = APIRouter(prefix="/me", tags=["Admin"])


@router.get("")
async def get_my_profile(user=Depends(validate_telegram_data)):
    tg_id = user['id']
    res = supabase.table("masters").select("*, is_premium, is_approved").eq("telegram_id", tg_id).execute()
    if not res.data:
        new_user = {
            "telegram_id": tg_id,
            "username": user.get("username"),
            "full_name": f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
        }
        res = supabase.table("masters").insert(new_user).execute()
        return {"user": user, "profile": res.data[0]}
    return {"user": user, "profile": res.data[0]}


@router.patch("/profile")
async def update_profile(data: MasterProfileUpdate, user=Depends(validate_telegram_data)):
    tg_id = user['id']
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}

    if 'photos' in update_data:
        if update_data['photos'] and len(update_data['photos']) > 0:
            update_data['avatar_url'] = update_data['photos'][0]
        else:
            update_data['avatar_url'] = None

    res = supabase.table("masters").update(update_data).eq("telegram_id", tg_id).execute()

    if res.data:
        master = res.data[0]
        # Если мастер заполнил название салона (регистрация), но еще не одобрен
        if master.get('salon_name') and not master.get('is_approved'):
            try:
                admin_msg = (
                    f"🚨 <b>Новая регистрация!</b>\n"
                    f"Салон: {master.get('salon_name')}\n"
                    f"Тел: {master.get('phone') or 'Не указан'}\n"
                    f"ID: <code>{master.get('telegram_id')}</code>\n\n"
                    f"👉 Зайди в базу и поставь is_approved = TRUE"
                )

                async with httpx.AsyncClient() as client:
                    await client.post(
                        # [FIX] Используем settings
                        f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                        json={
                            "chat_id": settings.ADMIN_CHAT_ID, # [FIX] Используем settings
                            "text": admin_msg,
                            "parse_mode": "HTML"
                        }
                    )
            except Exception as e:
                print(f"Error sending admin notification: {e}")

    return res.data


@router.post("/upload-photo")
async def upload_photo(file: UploadFile = File(...), user=Depends(validate_telegram_data)):
    tg_id = user['id']
    res = supabase.table("masters").select("photos, is_premium").eq("telegram_id", tg_id).single().execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Master not found")

    master = res.data
    current_photos = master.get('photos') or []
    is_premium = master.get('is_premium', False)

    display_limit = 10 if is_premium else 3
    upload_limit = display_limit + 5

    if len(current_photos) >= upload_limit:
        raise HTTPException(
            status_code=403,
            detail=f"Временное хранилище переполнено ({upload_limit} фото). Сохраните профиль, чтобы очистить место."
        )

    try:
        original_bytes = await file.read()
        compressed_bytes = compress_image(original_bytes, max_size=1024, quality=80)

        file_path = f"{user['id']}/{uuid.uuid4()}.jpg"
        bucket_name = "avatars"

        supabase.storage.from_(bucket_name).upload(
            path=file_path,
            file=compressed_bytes,
            file_options={"content-type": "image/jpeg"}
        )

        public_url = supabase.storage.from_(bucket_name).get_public_url(file_path)
        return {"url": public_url}

    except Exception as e:
        print(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload photo")


# --- Services ---

@router.get("/services")
async def get_services(user=Depends(validate_telegram_data)):
    res = supabase.table("services") \
        .select("*") \
        .eq("master_telegram_id", user['id']) \
        .eq("is_active", True) \
        .order("id") \
        .execute()
    return res.data


@router.post("/services")
async def create_service(srv: ServiceCreate, user=Depends(validate_telegram_data)):
    master_info = supabase.table("masters").select("is_premium").eq("telegram_id", user['id']).single().execute()
    is_premium = master_info.data.get('is_premium', False)

    if not is_premium:
        count_res = supabase.table("services").select("id", count="exact").eq("master_telegram_id", user['id']).eq(
            "is_active", True).execute()
        current_count = count_res.count

        if current_count >= 10:
            raise HTTPException(status_code=403,
                                detail="На базовом тарифе доступно не более 10 услуг. Перейдите на Pro.")

    data = srv.model_dump()
    data['master_telegram_id'] = user['id']
    data['is_active'] = True
    res = supabase.table("services").insert(data).execute()
    return res.data


@router.patch("/services/{service_id}")
async def update_service(
        service_id: int,
        srv: ServiceUpdate,
        user=Depends(validate_telegram_data)
):
    update_data = srv.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data provided")

    res = supabase.table("services").update(update_data) \
        .eq("id", service_id) \
        .eq("master_telegram_id", user['id']) \
        .execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Service not found or access denied")

    return res.data[0]


@router.delete("/services/{sid}")
async def delete_service(sid: int, user=Depends(validate_telegram_data)):
    res = supabase.table("services") \
        .update({"is_active": False}) \
        .eq("id", sid) \
        .eq("master_telegram_id", user['id']) \
        .execute()
    return {"status": "archived"}


# --- Working Hours ---

@router.get("/working-hours")
async def get_hours(user=Depends(validate_telegram_data)):
    res = supabase.table("working_hours").select("*").eq("master_telegram_id", user['id']).execute()
    return res.data


@router.post("/working-hours")
async def set_hours(hours: List[WorkingHourItem], user=Depends(validate_telegram_data)):
    master_info = supabase.table("masters").select("is_premium").eq("telegram_id", user['id']).single().execute()
    is_premium = master_info.data.get('is_premium', False)

    data_list = []
    for h in hours:
        item = h.model_dump()
        item['master_telegram_id'] = user['id']
        if not is_premium:
            item['slot_minutes'] = 30
        data_list.append(item)

    supabase.table("working_hours").delete().eq("master_telegram_id", user['id']).execute()
    if data_list:
        supabase.table("working_hours").insert(data_list).execute()
    return {"status": "updated"}


# --- Appointments ---

@router.get("/appointments")
async def get_my_appointments(user=Depends(validate_telegram_data)):
    res = supabase.table("appointments") \
        .select("*, services(name)") \
        .eq("master_telegram_id", user['id']) \
        .order("starts_at", desc=False) \
        .execute()
    return res.data


# --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ АДМИНСКИХ УВЕДОМЛЕНИЙ ---
async def notify_client_status(aid: int, status: str, master_id: int):
    """
    Отправляет уведомление клиенту о смене статуса (подтверждение/отмена).
    Выполняется в фоне.
    """
    try:
        # Получаем детали записи
        details = supabase.table("appointments").select("*, services(name)").eq("id", aid).single().execute()
        appt = details.data
        if not appt or not appt.get('client_telegram_id'):
            return

        # Получаем таймзону мастера
        master_res = supabase.table("masters").select("timezone").eq("telegram_id", master_id).single().execute()
        tz_name = master_res.data.get('timezone', 'Asia/Almaty') if master_res.data else 'Asia/Almaty'

        # Экранирование данных
        raw_srv = appt.get('services', {}).get('name', 'Груминг') if appt.get('services') else "Груминг"
        service_name = escape_html(raw_srv)

        raw_pet = appt.get('pet_name', 'Не указано')
        pet_name = escape_html(raw_pet)

        # Форматирование времени
        try:
            utc_dt = datetime.fromisoformat(appt['starts_at'].replace('Z', '+00:00'))
            master_tz = pytz.timezone(tz_name)
            local_dt = utc_dt.astimezone(master_tz)
            date_str = local_dt.strftime('%d.%m.%Y в %H:%M')
        except:
            date_str = str(appt.get('starts_at', ''))

        msg = ""
        if status == "confirmed":
            msg = (
                f"✅ <b>Ваша запись подтверждена!</b>\n\n"
                f"🐶 Питомец: <b>{pet_name}</b>\n"
                f"✂️ Услуга: {service_name}\n"
                f"🗓 Время: {date_str}\n\n"
                f"📍 Ждем вас!"
            )
        elif status == "cancelled":
            msg = (
                f"🚫 <b>Запись отменена</b>\n\n"
                f"К сожалению, мастер отменил вашу запись.\n\n"
                f"🐶 Питомец: <b>{pet_name}</b>\n"
                f"✂️ Услуга: {service_name}\n"
                f"🗓 Время: {date_str}\n\n"
                f"Пожалуйста, выберите другое удобное время."
            )

        if msg:
            # [FIX] 2. Добавляем await, так как функция теперь асинхронная
            await send_telegram_message(appt['client_telegram_id'], msg)
    except Exception as e:
        print(f"Client notify error: {e}")


@router.post("/appointments/{aid}/confirm")
async def confirm_appointment(
        aid: int,
        background_tasks: BackgroundTasks,
        user=Depends(validate_telegram_data)
):
    res = supabase.table("appointments").update({"status": "confirmed"}) \
        .eq("id", aid).eq("master_telegram_id", user['id']).execute()

    if res.data:
        # Запускаем уведомление в фоне
        background_tasks.add_task(notify_client_status, aid, "confirmed", user['id'])

    return res.data


@router.post("/appointments/{aid}/complete")
async def complete_appointment(aid: int, user=Depends(validate_telegram_data)):
    res = supabase.table("appointments").update({"status": "completed"}) \
        .eq("id", aid).eq("master_telegram_id", user['id']).execute()
    return res.data


@router.post("/appointments/{aid}/cancel")
async def cancel_appointment(
        aid: int,
        background_tasks: BackgroundTasks,
        user=Depends(validate_telegram_data)
):
    res = supabase.table("appointments").update({"status": "cancelled"}) \
        .eq("id", aid).eq("master_telegram_id", user['id']).execute()

    if res.data:
        # Запускаем уведомление в фоне
        background_tasks.add_task(notify_client_status, aid, "cancelled", user['id'])

    return res.data