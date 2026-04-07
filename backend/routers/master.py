import time
import json
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from telebot import types

from config import supabase, bot, logger, ADMIN_CHAT_ID
from schemas import SalonCreate, SalonUpdate, ServiceCreate, ServiceUpdate, ProductCreate, ProductUpdate
from logic import verify_telegram_data

router = APIRouter()


# --- USER STATUS ---
@router.get("/api/user-status/{tg_id}")
async def check_user_status(tg_id: int):
    res = supabase.table("salons").select("id, is_approved").eq("telegram_chat_id", tg_id).execute()
    if res.data:
        return {
            "isMaster": True,
            "salonId": res.data[0]['id'],
            "isApproved": res.data[0].get('is_approved', False)
        }
    return {"isMaster": False}


# --- REGISTRATION ---
@router.post("/api/register")
async def register_salon(p: SalonCreate, tg_user_id: Optional[int] = Depends(verify_telegram_data)):
    # 1. Жесткая проверка: запрос точно пришел из Telegram?
    if not tg_user_id:
        raise HTTPException(401, "Unauthorized")

    # 2. Жесткая проверка: юзер не пытается зарегистрировать салон на чужой ID?
    if p.telegram_chat_id != tg_user_id:
        raise HTTPException(403, "Нельзя зарегистрировать салон на чужой ID")

    existing = supabase.table("salons").select("*").eq("telegram_chat_id", p.telegram_chat_id).execute()
    if existing.data: return {"success": True, "data": existing.data[0]}

    new_s = p.dict()
    new_s.update({
        "slug": f"s_{p.telegram_chat_id}_{int(time.time())}",
        "is_active": True,
        "is_approved": False,
        "niche": p.niche,
        "schedule": json.dumps(
            [{"day": d, "isWorking": d not in ["Сб", "Вс"], "hours": {"start": "10:00", "end": "20:00"}} for d in
             ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]])
    })
    res = supabase.table("salons").insert(new_s).execute()
    new_salon = res.data[0]

    # --- ОНБОРДИНГ: Автоматическое создание услуг-шаблонов ---
    default_services = []
    if p.niche == "beauty":
        default_services = [
            {"title": "Маникюр + Гель-лак", "price": 6000, "duration_minutes": 120, "salon_id": new_salon['id'],
             "is_active": True},
            {"title": "Снятие чужого покрытия", "price": 1000, "duration_minutes": 15, "salon_id": new_salon['id'],
             "is_active": True}
        ]
    elif p.niche == "grooming":
        default_services = [
            {"title": "Комплексная стрижка", "price": 8000, "duration_minutes": 90, "salon_id": new_salon['id'],
             "is_active": True},
            {"title": "Гигиена", "price": 4000, "duration_minutes": 60, "salon_id": new_salon['id'], "is_active": True}
        ]

    if default_services:
        supabase.table("services").insert(default_services).execute()

    # Уведомление админа
    if ADMIN_CHAT_ID:
        try:
            markup = types.InlineKeyboardMarkup()
            markup.row(types.InlineKeyboardButton("✅ Одобрить", callback_data=f"approve_{new_salon['id']}"),
                       types.InlineKeyboardButton("❌ Отклонить", callback_data=f"reject_{new_salon['id']}"))

            niche_icon = "💅 Бьюти" if p.niche == "beauty" else "🐶 Груминг"
            msg = f"🚨 <b>Новая регистрация!</b>\n\n👤 {new_salon['name']}\n📍 {new_salon.get('address')}\n📞 {new_salon.get('phone')}\n🏷 Ниша: {niche_icon}"
            bot.send_message(ADMIN_CHAT_ID, msg, parse_mode="HTML", reply_markup=markup)
        except Exception as e:
            logger.error(f"Admin notify error: {e}")

    return {"success": True, "data": new_salon}


@router.patch("/api/salons/{salon_id}")
async def update_salon(salon_id: str, p: SalonUpdate, uid: Optional[int] = Depends(verify_telegram_data)):
    if not uid: raise HTTPException(401, "Unauthorized")  # Жесткая проверка

    check = supabase.table("salons").select("id").eq("id", salon_id).eq("telegram_chat_id", uid).execute()
    if not check.data:
        raise HTTPException(403, "Forbidden")

    res = supabase.table("salons").update(p.dict(exclude_unset=True)).eq("id", salon_id).execute()
    return {"success": True, "data": res.data[0]}


# --- SERVICES ---
@router.post("/api/services")
async def create_svc(p: ServiceCreate, uid: Optional[int] = Depends(verify_telegram_data)):
    if not uid: raise HTTPException(401, "Unauthorized")

    check = supabase.table("salons").select("id").eq("id", p.salon_id).eq("telegram_chat_id", uid).execute()
    if not check.data:
        raise HTTPException(403, "Forbidden")

    res = supabase.table("services").insert({**p.dict(), "is_active": True}).execute()
    return {"success": True, "data": res.data[0]}


@router.delete("/api/services/{sid}")
async def del_svc(sid: str, uid: Optional[int] = Depends(verify_telegram_data)):
    if not uid: raise HTTPException(401, "Unauthorized")

    svc = supabase.table("services").select("salon_id").eq("id", sid).single().execute()
    if not svc.data: raise HTTPException(404, "Service not found")

    check = supabase.table("salons").select("id").eq("id", svc.data['salon_id']).eq("telegram_chat_id", uid).execute()
    if not check.data:
        raise HTTPException(403, "Forbidden")

    supabase.table("services").update({"is_active": False}).eq("id", sid).execute()
    return {"success": True}


@router.patch("/api/services/{sid}")
async def up_svc(sid: str, p: ServiceUpdate, uid: Optional[int] = Depends(verify_telegram_data)):
    if not uid: raise HTTPException(401, "Unauthorized")  # Добавили защиту и сюда

    svc = supabase.table("services").select("salon_id").eq("id", sid).single().execute()
    if not svc.data: raise HTTPException(404, "Service not found")

    check = supabase.table("salons").select("id").eq("id", svc.data['salon_id']).eq("telegram_chat_id", uid).execute()
    if not check.data:
        raise HTTPException(403, "Forbidden")

    res = supabase.table("services").update(p.dict(exclude_unset=True)).eq("id", sid).execute()
    return {"success": True, "data": res.data[0]}


# --- PRODUCTS ---
@router.get("/api/products/{salon_id}")
async def get_products(salon_id: str):
    res = supabase.table("products").select("*").eq("salon_id", salon_id).eq("is_active", True).execute()
    return res.data


@router.post("/api/products")
async def create_product(p: ProductCreate, uid: Optional[int] = Depends(verify_telegram_data)):
    if not uid: raise HTTPException(401, "Unauthorized")

    check = supabase.table("salons").select("id").eq("id", p.salon_id).eq("telegram_chat_id", uid).execute()
    if not check.data:
        raise HTTPException(403, "Forbidden")

    res = supabase.table("products").insert(p.dict()).execute()
    return {"success": True, "data": res.data[0]}


@router.patch("/api/products/{pid}")
async def update_product(pid: str, p: ProductUpdate, uid: Optional[int] = Depends(verify_telegram_data)):
    if not uid: raise HTTPException(401, "Unauthorized")

    prod = supabase.table("products").select("salon_id").eq("id", pid).single().execute()
    if not prod.data: raise HTTPException(404, "Product not found")

    check = supabase.table("salons").select("id").eq("id", prod.data['salon_id']).eq("telegram_chat_id", uid).execute()
    if not check.data:
        raise HTTPException(403, "Forbidden")

    res = supabase.table("products").update(p.dict(exclude_unset=True)).eq("id", pid).execute()
    return {"success": True, "data": res.data[0]}


@router.delete("/api/products/{pid}")
async def delete_product(pid: str, uid: Optional[int] = Depends(verify_telegram_data)):
    if not uid: raise HTTPException(401, "Unauthorized")

    prod = supabase.table("products").select("salon_id").eq("id", pid).single().execute()
    if not prod.data: raise HTTPException(404, "Product not found")

    check = supabase.table("salons").select("id").eq("id", prod.data['salon_id']).eq("telegram_chat_id", uid).execute()
    if not check.data:
        raise HTTPException(403, "Forbidden")

    supabase.table("products").update({"is_active": False}).eq("id", pid).execute()
    return {"success": True}