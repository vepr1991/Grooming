from pydantic import BaseModel
from typing import Optional, List

# --- Профиль Мастера ---
class MasterProfileUpdate(BaseModel):
    salon_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    description: Optional[str] = None
    map_link: Optional[str] = None
    avatar_url: Optional[str] = None
    photos: Optional[List[str]] = None
    timezone: Optional[str] = None

# --- Услуги ---
class ServiceBase(BaseModel):
    name: str
    price: float
    duration_min: int = 60
    description: Optional[str] = ""
    category: str = 'dog'

class ServiceCreate(ServiceBase):
    pass

# --- НОВОЕ: Схема для обновления услуги ---
class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    duration_min: Optional[int] = None
    description: Optional[str] = None
    category: Optional[str] = None
# ----------------------------------------

class ServiceResponse(ServiceBase):
    id: int
    master_telegram_id: int
    is_active: bool

# --- График работы ---
class WorkingHourItem(BaseModel):
    day_of_week: int
    start_time: str
    end_time: str
    slot_minutes: int = 30
