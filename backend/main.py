import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
import telebot
from datetime import datetime, timedelta

# Настройки
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # На продакшене лучше заменить на конкретный URL фронтенда
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация Supabase и Бота
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") # На сервере используй Service Role
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

bot = telebot.TeleBot(os.getenv("TELEGRAM_BOT_TOKEN"))

# Модели данных
class BookingData(BaseModel):
    salonId: str
    service: dict
    date: str
    time: str
    client: dict
    pet: dict

@app.get("/")
def home():
    return {"status": "Grooming API is running"}

@app.post("/api/book")
async def create_booking(data: BookingData):
    try:
        # 1. Считаем время окончания
        start_dt = datetime.fromisoformat(f"{data.date}T{data.time}:00")
        duration = data.service.get('duration_minutes', 30)
        end_dt = start_dt + timedelta(minutes=duration)

        # 2. Сохраняем в Supabase
        # .select("*, salons(telegram_chat_id)") позволит вытянуть ID мастера одним запросом
        res = supabase.table("appointments").insert({
            "salon_id": data.salonId,
            "service_id": data.service['id'],
            "client_name": data.client['name'],
            "client_phone": data.client['phone'],
            "pet_name": data.pet['name'],
            "pet_breed": data.pet.get('petBreed', ''),
            "start_time": start_dt.isoformat(),
            "end_time": end_dt.isoformat(),
            "status": "pending"
        }).execute()

        appointment = res.data[0]

        # 3. Получаем данные салона для уведомления
        salon_res = supabase.table("salons").select("telegram_chat_id, name").eq("id", data.salonId).single().execute()
        master_chat_id = salon_res.data.get("telegram_chat_id")

        # 4. Отправляем уведомление в Telegram
        if master_chat_id:
            msg = (
                f"🔔 *Новая запись!*\n\n"
                f"👤 Клиент: {data.client['name']}\n"
                f"📞 Тел: {data.client['phone']}\n"
                f"🐶 Питомец: {data.pet['name']} ({data.pet.get('petBreed', '---')})\n"
                f"✂️ Услуга: {data.service['title']}\n"
                f"📅 Дата: {data.date}\n"
                f"⏰ Время: {data.time}\n\n"
                f"_Подтвердите запись в приложении!_"
            )
            bot.send_message(master_chat_id, msg, parse_mode="Markdown")

        return {"success": True, "appointment_id": appointment['id']}

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Render сам назначит порт через переменную окружения PORT
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)