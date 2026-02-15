import os
import threading
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
import telebot
from datetime import datetime, timedelta

# Инициализация FastAPI
app = FastAPI()

# Настройка CORS для работы с фронтендом
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация ресурсов из переменных окружения
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN)

# Модели данных для API
class BookingData(BaseModel):
    salonId: str
    service: dict
    date: str
    time: str
    client: dict
    pet: dict

@app.get("/")
def health_check():
    return {"status": "Grooming API is active"}

@app.post("/api/book")
async def create_booking(data: BookingData):
    try:
        # 1. Расчет времени начала и конца
        start_dt = datetime.fromisoformat(f"{data.date}T{data.time}:00")
        duration = data.service.get('duration_minutes', 30)
        end_dt = start_dt + timedelta(minutes=duration)

        # 2. Сохранение в базу через Service Role (обходим RLS)
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

        if not res.data:
            raise Exception("Ошибка вставки в БД")

        # 3. Уведомление мастера в Telegram
        salon_res = supabase.table("salons").select("telegram_chat_id, name").eq("id", data.salonId).single().execute()
        master_id = salon_res.data.get("telegram_chat_id")

        if master_id:
            msg = (
                f"🔔 *Новая запись!*\n\n"
                f"👤 Клиент: {data.client['name']}\n"
                f"📞 Тел: {data.client['phone']}\n"
                f"🐶 Питомец: {data.pet['name']} ({data.pet.get('petBreed', '---')})\n"
                f"✂️ Услуга: {data.service['title']}\n"
                f"📅 Дата: {data.date}\n"
                f"⏰ Время: {data.time}\n"
            )
            bot.send_message(master_id, msg, parse_mode="Markdown")

        return {"success": True, "id": res.data[0]['id']}

    except Exception as e:
        print(f"Booking Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Логика Телеграм-бота ---

@bot.message_handler(commands=['start'])
def send_welcome(message):
    # Команда /start поможет мастеру узнать свой chat_id для настроек
    welcome_text = (
        f"Привет! Ваш Telegram ID: `{message.chat.id}`\n\n"
        "Скопируйте его и вставьте в профиль мастера, чтобы получать уведомления о записях."
    )
    bot.reply_to(message, welcome_text, parse_mode="Markdown")

# Запуск бота в отдельном потоке, чтобы он не мешал API
def run_bot():
    bot.infinity_polling()

threading.Thread(target=run_bot, daemon=True).start()

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)