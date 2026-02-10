# (c) 2026 Владимир Коваленко. Все права защищены.
# Данный код является интеллектуальной собственностью автора.
# Использование, копирование или распространение без разрешения запрещено.
import hashlib
import hmac
import json
from urllib.parse import parse_qsl
from fastapi import Header, HTTPException
from .config import BOT_TOKEN


def validate_telegram_data(x_tg_init_data: str = Header(...)):
    """
    Проверяет подлинность данных от Telegram WebApp.
    Возвращает словарь с данными пользователя.
    """
    if not x_tg_init_data:
        raise HTTPException(401, "No init data")

    try:
        parsed_data = dict(parse_qsl(x_tg_init_data))
        hash_check = parsed_data.pop('hash')

        # Сортировка ключей a-z
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed_data.items()))

        # Вычисление HMAC
        secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

        if calculated_hash != hash_check:
            raise HTTPException(403, "Invalid hash")

        user_data = json.loads(parsed_data['user'])
        return user_data
    except Exception as e:
        raise HTTPException(403, f"Validation failed: {str(e)}")