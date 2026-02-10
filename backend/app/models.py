# (c) 2026 Владимир Коваленко. Все права защищены.
# Данный код является интеллектуальной собственностью автора.
# Использование, копирование или распространение без разрешения запрещено.
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, time

class MasterUpdate(BaseModel):
    salon_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    timezone: Optional[str] = None

class ServiceModel(BaseModel):
    name: str
    price: float
    duration_min: int = 60
    description: Optional[str] = None
    is_active: bool = True

class WorkingHoursModel(BaseModel):
    day_of_week: int
    start_time: str # "HH:MM"
    end_time: str   # "HH:MM"
    slot_minutes: int = 30

class AppointmentCreate(BaseModel):
    master_tg_id: int
    service_id: int
    starts_at: datetime
    client_phone: str
    pet_name: str
    pet_breed: Optional[str] = None
    pet_weight_kg: Optional[float] = None
    comment: Optional[str] = None
    idempotency_key: str