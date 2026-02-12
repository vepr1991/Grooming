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
    pet_photos: List[str] = [] # Массив ссылок
    comment: Optional[str] = None
    idempotency_key: Optional[str] = None

    @field_validator('client_phone')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        clean = re.sub(r'\D', '', v)
        if len(clean) < 10: raise ValueError('Некорректный формат телефона')
        return v