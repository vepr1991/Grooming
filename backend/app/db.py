from supabase import create_client, Client
from .config import settings  # <--- Импортируем settings вместо переменных

# Используем settings.SUPABASE_URL и settings.SUPABASE_KEY
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)