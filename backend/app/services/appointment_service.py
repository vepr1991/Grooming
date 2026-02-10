from fastapi import HTTPException
from app.db import supabase
from app.schemas.appointment import AppointmentCreate
import uuid
from datetime import datetime, timezone

class AppointmentService:
    @staticmethod
    async def create(data: AppointmentCreate, client_id: int, client_username: str = None):
        """
        Создает запись с проверками безопасности и целостности данных.
        """
        # 1. Получаем данные
        appt_dict = data.model_dump()
        
        # --- FIX: Валидация времени (нельзя в прошлое) ---
        booking_time = data.starts_at
        # Приводим к UTC для корректного сравнения
        if booking_time.tzinfo is None:
             booking_time = booking_time.replace(tzinfo=timezone.utc)
        
        if booking_time < datetime.now(timezone.utc):
             raise HTTPException(status_code=400, detail="Нельзя записаться на прошедшее время")
        # -------------------------------------------------

        # 2. Формируем объект для вставки
        insert_data = {
            "master_telegram_id": appt_dict['master_telegram_id'],
            "service_id": appt_dict['service_id'],
            "client_telegram_id": client_id,
            "client_username": client_username,
            "client_name": appt_dict['client_name'],
            "client_phone": appt_dict['client_phone'],
            "pet_name": appt_dict['pet_name'],
            "pet_breed": appt_dict.get('pet_breed'),
            "comment": appt_dict.get('comment'),
            "starts_at": appt_dict['starts_at'].isoformat(),
            "status": "pending",
            "idempotency_key": appt_dict.get('idempotency_key') or str(uuid.uuid4())
        }

        # 3. Проверяем, что услуга принадлежит мастеру
        service_check = supabase.table("services").select("id") \
            .eq("id", insert_data['service_id']) \
            .eq("master_telegram_id", insert_data['master_telegram_id']) \
            .execute()

        if not service_check.data:
            raise HTTPException(status_code=400, detail="Услуга не найдена или не принадлежит этому мастеру")

        # 4. Вставка в БД с обработкой дублей
        try:
            res = supabase.table("appointments").insert(insert_data).execute()
            if res.data:
                return res.data[0]
        except Exception as e:
            error_str = str(e).lower()
            if "duplicate key" in error_str or "23505" in error_str:
                raise HTTPException(status_code=409, detail="Извините, это время уже занято")
            
            print(f"Database Error: {e}")
            raise HTTPException(status_code=500, detail="Ошибка сохранения записи")
