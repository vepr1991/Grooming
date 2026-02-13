import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import requests
from supabase import create_client, Client
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Загружаем переменные окружения (создадим .env позже)
load_dotenv()

app = FastAPI()

# Разрешаем запросы с фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Настройки Supabase (чтобы искать ID мастера)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. Настройки Телеграм Бота
TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN")


class BookingRequest(BaseModel):
    salon_id: str  # <--- Теперь нам нужен ID салона!
    client_name: str
    client_phone: str
    pet_name: str
    date: str
    time: str
    service_title: str


@app.post("/notify")
async def send_notification(booking: BookingRequest):
    # А. Спрашиваем у базы: "Какой Telegram ID у владельца этого салона?"
    try:
        response = supabase.table("salons") \
            .select("telegram_chat_id") \
            .eq("id", booking.salon_id) \
            .single() \
            .execute()

        # Если салон найден, берем ID
        master_chat_id = response.data.get("telegram_chat_id")

        if not master_chat_id:
            print("У мастера не указан Telegram ID")
            return {"status": "skipped", "reason": "No Telegram ID found"}

    except Exception as e:
        print("Ошибка Supabase:", e)
        raise HTTPException(status_code=500, detail="Ошибка поиска мастера")

    # Б. Формируем сообщение
    message = (
        f"🔔 <b>Новая запись!</b>\n\n"
        f"👤 <b>Клиент:</b> {booking.client_name}\n"
        f"📞 <b>Телефон:</b> {booking.client_phone}\n"
        f"🐶 <b>Питомец:</b> {booking.pet_name}\n"
        f"📅 <b>Когда:</b> {booking.date} в {booking.time}\n"
        f"✂️ <b>Услуга:</b> {booking.service_title}"
    )

    # В. Отправляем конкретному мастеру
    url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": master_chat_id,  # <--- Шлем динамически!
        "text": message,
        "parse_mode": "HTML"
    }

    requests.post(url, json=payload)

    return {"status": "ok", "target": master_chat_id}