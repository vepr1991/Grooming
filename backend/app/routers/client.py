# (c) 2026 Владимир Коваленко. Все права защищены.
import base64
import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from datetime import datetime, timedelta
import pytz
import uuid

# [FIX] Импортируем get_current_user
from app.auth import get_current_user
from app.db import supabase
from app.utils import send_telegram_message, escape_html
from app.schemas.appointment import AppointmentCreate
from app.services.appointment_service import AppointmentService

router = APIRouter(tags=["Client"])


@router.get("/masters/{master_id}")
async def get_master_public_profile(master_id: int):
    # Выбираем только публичные поля
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


@router.get("/masters/{master_id}/schedule")
async def get_master_schedule(master_id: int):
    # Клиенту нужно знать только дни и время работы
    res = supabase.table("working_hours") \
        .select("day_of_week, start_time, end_time") \
        .eq("master_telegram_id", master_id) \
        .execute()
    return res.data


@router.get("/masters/{master_id}/availability")
async def get_master_availability(master_id: int, service_id: int, date: str):
    """
    Оптимизированный поиск слотов.
    """
    # 1. Загружаем таймзону и премиум статус
    master_res = supabase.table("masters") \
        .select("timezone, is_premium") \
        .eq("telegram_id", master_id) \
        .single() \
        .execute()

    if not master_res.data:
        raise HTTPException(404, "Master not found")

    master_data = master_res.data
    tz_name = master_data.get('timezone', 'Asia/Almaty')
    is_premium = master_data.get('is_premium', False)

    try:
        master_tz = pytz.timezone(tz_name)
    except pytz.UnknownTimeZoneError:
        master_tz = pytz.timezone('Asia/Almaty')

    # 2. Валидация даты
    try:
        naive_date = datetime.strptime(date, "%Y-%m-%d")
        target_date_start = master_tz.localize(naive_date)
        target_date_end = target_date_start + timedelta(days=1) - timedelta(seconds=1)
    except ValueError:
        raise HTTPException(400, "Invalid date format YYYY-MM-DD")

    now_in_tz = datetime.now(master_tz)
    if target_date_end < now_in_tz:
        return []

    # 3. Получаем длительность услуги
    srv_res = supabase.table("services").select("duration_min").eq("id", service_id).single().execute()
    if not srv_res.data:
        raise HTTPException(404, "Service not found")
    duration = srv_res.data.get('duration_min', 60)

    # 4. Получаем график на этот день недели
    weekday_iso = target_date_start.isoweekday()
    wh_res = supabase.table("working_hours") \
        .select("start_time, end_time, slot_minutes") \
        .eq("master_telegram_id", master_id) \
        .eq("day_of_week", weekday_iso) \
        .maybe_single() \
        .execute()

    if not wh_res.data:
        return []

    schedule = wh_res.data
    slot_step = 30 if not is_premium else schedule.get('slot_minutes', 30)

    def parse_time_to_dt(time_str, base_date):
        t = datetime.strptime(time_str, "%H:%M:%S").time()
        return base_date.replace(hour=t.hour, minute=t.minute, second=0)

    work_start_dt = parse_time_to_dt(schedule['start_time'], target_date_start)
    work_end_dt = parse_time_to_dt(schedule['end_time'], target_date_start)

    if work_start_dt < now_in_tz:
        minute_remainder = now_in_tz.minute % slot_step
        minutes_to_add = slot_step - minute_remainder
        next_slot_time = now_in_tz + timedelta(minutes=minutes_to_add)
        next_slot_time = next_slot_time.replace(second=0, microsecond=0)
        work_start_dt = max(work_start_dt, next_slot_time)

    # 5. Загружаем занятые интервалы
    day_start_utc = target_date_start.astimezone(pytz.utc)
    day_end_utc = target_date_end.astimezone(pytz.utc)

    busy_res = supabase.table("appointments") \
        .select("starts_at, services(duration_min)") \
        .eq("master_telegram_id", master_id) \
        .neq("status", "cancelled") \
        .gte("starts_at", day_start_utc.isoformat()) \
        .lt("starts_at", day_end_utc.isoformat()) \
        .order("starts_at") \
        .execute()

    busy_intervals = []
    for appt in busy_res.data:
        utc_start = datetime.fromisoformat(appt['starts_at'].replace('Z', '+00:00'))
        local_start = utc_start.astimezone(master_tz)
        srv_dur = 60
        if appt.get('services') and appt['services'].get('duration_min'):
            srv_dur = appt['services']['duration_min']
        local_end = local_start + timedelta(minutes=srv_dur)
        busy_intervals.append((local_start, local_end))

    # 6. Алгоритм генерации слотов (Linear Scan)
    free_slots = []
    current_slot = work_start_dt
    busy_idx = 0
    total_busy = len(busy_intervals)

    while current_slot + timedelta(minutes=duration) <= work_end_dt:
        slot_end = current_slot + timedelta(minutes=duration)
        is_busy = False

        while busy_idx < total_busy:
            busy_start, busy_end = busy_intervals[busy_idx]
            if busy_end <= current_slot:
                busy_idx += 1
                continue
            if busy_start >= slot_end:
                break
            is_busy = True
            break

        if not is_busy:
            free_slots.append(current_slot.isoformat())

        current_slot += timedelta(minutes=slot_step)

    return free_slots


@router.get("/my-appointments")
# [FIX] Используем get_current_user вместо validate_telegram_data
async def get_client_appointments(user=Depends(get_current_user)):
    res = supabase.table("appointments") \
        .select("*, services(name, price, duration_min), masters(salon_name, address, phone, avatar_url)") \
        .eq("client_telegram_id", user['id']) \
        .order("starts_at", desc=True) \
        .limit(20) \
        .execute()
    return res.data


@router.post("/upload-pet-photo")
# [FIX] Используем get_current_user вместо validate_telegram_data
async def upload_pet_photo(
        file: UploadFile = File(...),
        user=Depends(get_current_user)
):
    """Загрузка фото питомца (клиент)"""
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else "jpg"
    file_path = f"clients/{user['id']}/{uuid.uuid4()}.{file_ext}"

    file_content = await file.read()

    try:
        bucket_name = "avatars"

        supabase.storage.from_(bucket_name).upload(
            file_path,
            file_content,
            file_options={"content-type": file.content_type, "upsert": "true"}
        )

        public_url = supabase.storage.from_(bucket_name).get_public_url(file_path)
        return {"url": public_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload error: {str(e)}")


async def send_new_appointment_notification(new_appt: dict):
    try:
        service_name = "Услуга"
        try:
            srv_res = supabase.table("services").select("name").eq("id", new_appt['service_id']).single().execute()
            if srv_res.data:
                service_name = escape_html(srv_res.data.get('name', 'Услуга'))
        except:
            pass

        tz_name = 'Asia/Almaty'
        try:
            master_res = supabase.table("masters").select("timezone").eq("telegram_id", new_appt[
                'master_telegram_id']).single().execute()
            if master_res.data and master_res.data.get('timezone'):
                tz_name = master_res.data['timezone']
        except:
            pass

        try:
            utc_dt = datetime.fromisoformat(new_appt['starts_at'].replace('Z', '+00:00'))
            master_tz = pytz.timezone(tz_name)
            local_dt = utc_dt.astimezone(master_tz)
            date_str = local_dt.strftime('%d.%m.%Y в %H:%M')
        except:
            date_str = str(new_appt['starts_at'])

        safe_client_name = escape_html(new_appt.get('client_name', 'Не указано'))
        safe_username = escape_html(new_appt.get('client_username'))
        safe_phone = escape_html(new_appt.get('client_phone'))
        safe_pet_name = escape_html(new_appt.get('pet_name', 'Не указано'))
        safe_pet_breed = escape_html(new_appt.get('pet_breed'))
        safe_comment = escape_html(new_appt.get('comment'))

        client_line = f"👤 Клиент: {safe_client_name}"
        if safe_username:
            client_line += f" (@{safe_username})"

        pet_line = f"🐶 Питомец: {safe_pet_name}"
        if safe_pet_breed:
            pet_line += f" ({safe_pet_breed})"

        comment_section = ""
        if safe_comment:
            comment_section = f"\n💬 Комментарий: {safe_comment}"

        photo_info = ""
        if new_appt.get('pet_photos') and len(new_appt['pet_photos']) > 0:
            photo_info = "\n📷 <b>Прикреплено фото питомца</b>"

        msg = (
            f"🆕 <b>Новая запись!</b>\n\n"
            f"{client_line}\n"
            f"📞 Телефон: {safe_phone}\n"
            f"{pet_line}\n"
            f"✂️ Услуга: {service_name}\n"
            f"🗓 Время: {date_str}\n"
            f"{photo_info}\n"
            f"{comment_section}"
        )
        await send_telegram_message(new_appt['master_telegram_id'], msg)
    except Exception as e:
        print(f"Background notify error: {e}")


@router.post("/appointments")
async def create_appointment_public(
        app_data: AppointmentCreate,
        background_tasks: BackgroundTasks,
        user=Depends(get_current_user)
):
    # --- ЛОГИКА ОБРАБОТКИ ФОТО ---
    if app_data.pet_photo_base64:
        try:
            # 1. Очищаем заголовок base64 (data:image/jpeg;base64,...)
            if "," in app_data.pet_photo_base64:
                header, encoded = app_data.pet_photo_base64.split(",", 1)
            else:
                encoded = app_data.pet_photo_base64

            # 2. Декодируем
            file_content = base64.b64decode(encoded)

            # 3. Генерируем путь
            file_path = f"appointments/{user['id']}/{uuid.uuid4()}.jpg"
            bucket_name = "avatars"  # Или создайте бакет 'appointments'

            # 4. Загружаем в Supabase
            supabase.storage.from_(bucket_name).upload(
                path=file_path,
                file=file_content,
                file_options={"content-type": "image/jpeg", "upsert": "true"}
            )

            # 5. Получаем публичную ссылку
            public_url = supabase.storage.from_(bucket_name).get_public_url(file_path)

            # 6. Добавляем в список фото для сохранения в БД
            app_data.pet_photos = [public_url]

        except Exception as e:
            print(f"Error processing client photo: {e}")
            # Не прерываем запись, если фото не загрузилось, просто идем дальше
            pass
    # -----------------------------

    new_appt = await AppointmentService.create(
        data=app_data,
        client_id=user['id'],
        client_username=user.get('username')
    )

    background_tasks.add_task(send_new_appointment_notification, new_appt)
    return new_appt