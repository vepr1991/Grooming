from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, Any, List
import re

# --- КЛИЕНТЫ ---
class ClientInfo(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    phone: str = Field(..., min_length=5, max_length=20)
    telegram_user: Optional[Dict[str, Any]] = None

    @validator('phone')
    def v_phone(cls, v):
        if not re.match(r'^[\d\+\-\(\)\s]+$', v): raise ValueError('Bad phone')
        return v

class PetInfo(BaseModel):
    name: str = Field(..., min_length=1, max_length=30)
    petBreed: Optional[str] = Field(default="", max_length=50)

# --- УСЛУГИ (В ЗАПИСИ) ---
class ServiceInfo(BaseModel):
    id: str
    title: str
    price: int
    duration_minutes: int = Field(..., gt=0)

# --- БРОНИРОВАНИЕ ---
class BookingRequest(BaseModel):
    salonId: str
    services: List[ServiceInfo]
    date: str
    time: str
    client: ClientInfo
    pet: PetInfo

class BlockRequest(BaseModel):
    salonId: str
    date: str
    time: str
    duration_minutes: int = Field(..., gt=0)
    reason: Optional[str] = "Перерыв"

class StatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|confirmed|completed|canceled|blocked)$")

# --- САЛОН ---
class SalonCreate(BaseModel):
    telegram_chat_id: int
    name: str = Field(..., min_length=2, max_length=50)
    address: Optional[str] = ""
    phone: Optional[str] = ""
    slot_step: Optional[int] = 30

class SalonUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    description: Optional[str] = None
    schedule: Optional[str] = None
    photo_url: Optional[str] = None
    gallery: Optional[List[str]] = None
    slot_step: Optional[int] = None

# --- УСЛУГИ (СОЗДАНИЕ/РЕДАКТИРОВАНИЕ) ---
class ServiceCreate(BaseModel):
    salon_id: str
    title: str = Field(..., min_length=2, max_length=50)
    description: Optional[str] = ""
    price: int = Field(..., ge=0)
    duration_minutes: int = Field(..., gt=0)
    image_url: Optional[str] = None

class ServiceUpdate(BaseModel):
    title: Optional[str] = None
    price: Optional[int] = None
    duration_minutes: Optional[int] = None
    description: Optional[str] = None
    image_url: Optional[str] = None

# --- ТОВАРЫ (НОВОЕ) ---
class ProductCreate(BaseModel):
    salon_id: str
    title: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = ""
    price: int = Field(..., ge=0)
    image_url: Optional[str] = None

class ProductUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[int] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None