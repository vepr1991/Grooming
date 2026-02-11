import hashlib
import hmac
import urllib.parse
import json
import time
from fastapi import Request, HTTPException
from fastapi.security import HTTPBearer
from typing import Optional
from .config import settings

security = HTTPBearer()

def validate_telegram_data(init_data: str) -> dict:
    """
    Валидирует данные, пришедшие от Telegram Mini App,
    и проверяет срок их действия (защита от Replay-атак).
    """
    try:
        # 1. Парсим строку initData
        parsed_data = dict(urllib.parse.parse_qsl(init_data))
        
        if "hash" not in parsed_data:
            raise HTTPException(status_code=401, detail="No hash in data")

        received_hash = parsed_data.pop("hash")

        # 2. [NEW] Проверка срока действия (auth_date)
        auth_date = parsed_data.get("auth_date")
        if not auth_date:
            raise HTTPException(status_code=401, detail="No auth_date in data")
            
        try:
            auth_date_int = int(auth_date)
            current_time = int(time.time())
            
            # Проверяем, что данные не старше 24 часов (86400 секунд)
            if current_time - auth_date_int > 86400:
                raise HTTPException(status_code=401, detail="Telegram data is expired (older than 24h)")
        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid auth_date format")

        # 3. Валидация подписи (HMAC)
        data_check_string = "\n".join(
            f"{k}={v}" for k, v in sorted(parsed_data.items())
        )
        
        secret_key = hmac.new(
            "WebAppData".encode(), 
            settings.BOT_TOKEN.encode(), 
            hashlib.sha256
        ).digest()
        
        calculated_hash = hmac.new(
            secret_key, 
            data_check_string.encode(), 
            hashlib.sha256
        ).hexdigest()

        if calculated_hash != received_hash:
            raise HTTPException(status_code=401, detail="Invalid Telegram hash")

        # 4. Возвращаем распарсенные данные пользователя
        user_data = json.loads(parsed_data.get("user", "{}"))
        return user_data

    except Exception as e:
        # Ловим любые ошибки парсинга
        raise HTTPException(status_code=401, detail=f"Validation failed: {str(e)}")

async def get_current_user(request: Request) -> dict:
    """
    Dependency для FastAPI: достает пользователя из заголовка Authorization.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("tma "):
        raise HTTPException(status_code=401, detail="Missing or invalid tma token")
    
    init_data = auth_header[4:] # Убираем "tma "
    user_data = validate_telegram_data(init_data)
    
    return user_data
