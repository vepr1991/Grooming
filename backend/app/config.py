import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") # ВАЖНО: Service Role для бэка
BOT_TOKEN = os.getenv("BOT_TOKEN") # Для валидации initData