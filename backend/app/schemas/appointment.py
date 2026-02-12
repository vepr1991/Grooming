from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
import re

class AppointmentCreate(BaseModel):
    master_telegram_id: int
    service_id: int
    starts_at: datetime

    client_name: str
    client_phone: str
    client_username: Optional[str] = None

    pet_name: str
    pet_breed: Optional[str] = None

    # [CLEANUP] Мы полностью убрали pet_photos_base64.
    # Теперь сервер принимает только готовые ссылки на фотографии,
    # которые клиент уже загрузил напрямую в Supabase Storage.
    pet_photos: List[str] = []

    comment: Optional[str] = None
    idempotency_key: Optional[str] = None

    @field_validator('client_phone')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        # Очищаем номер от лишних символов для валидации
        clean_phone = re.sub(r'\D', '', v)
        if len(clean_phone) < 10:
            raise ValueError('Номер телефона должен содержать минимум 10 цифр')
        return v