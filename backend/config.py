import os
import logging
from supabase import create_client, Client
from telebot.async_telebot import AsyncTeleBot
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# --- 1. Настройка логирования ---
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger("grooming_api")

# --- 2. Переменные окружения ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID")
BACKEND_URL = os.getenv("BACKEND_URL") # Нужен для вебхуков

# Проверка критических переменных
if not all([SUPABASE_URL, SUPABASE_KEY, TELEGRAM_BOT_TOKEN]):
    logger.critical("⚠️ КРИТИЧЕСКАЯ ОШИБКА: Не заданы переменные окружения (SUPABASE_URL, KEY или TOKEN)!")

# --- 3. Инициализация клиентов ---
# База данных
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Телеграм бот (ИЗМЕНЕНИЕ: Теперь асинхронный)
bot = AsyncTeleBot(TELEGRAM_BOT_TOKEN)

# Планировщик задач (для напоминаний)
scheduler = AsyncIOScheduler()