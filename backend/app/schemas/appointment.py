from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
import re

class AppointmentCreate(BaseModel):
    master_telegram_id: int  # Имя поля совпадает с БД и Фронтендом
    service_id: int
    starts_at: datetime
    
    client_name: str
    client_phone: str
    client_username: Optional[str] = None
    
    pet_name: str
    pet_breed: Optional[str] = None
    comment: Optional[str] = None
    
    idempotency_key: Optional[str] = None

    @field_validator('client_phone')
    def validate_phone(cls, v):
        if not re.match(r'^[\d\+\(\)\-\s]{10,20}$', v):
            raise ValueError('Некорректный формат телефона')
        return v
