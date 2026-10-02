import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from fastapi import Header, HTTPException

import config


def validate_init_data(raw: str) -> dict:
    try:
        pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=True)
        data = dict(pairs)
        if len(data) != len(pairs) or not config.TELEGRAM_BOT_TOKEN:
            raise ValueError("invalid data")
        signature = data.pop("hash")
        message = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
        secret = hmac.new(b"WebAppData", config.TELEGRAM_BOT_TOKEN.encode(), hashlib.sha256).digest()
        expected = hmac.new(secret, message.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        age = time.time() - int(data["auth_date"])
        if not -30 <= age <= config.AUTH_MAX_AGE:
            raise ValueError("expired")
        user = json.loads(data["user"])
        if type(user.get("id")) is not int or user["id"] <= 0:
            raise ValueError("user")
        return user
    except (ValueError, KeyError, TypeError):
        raise HTTPException(401, "Откройте приложение заново через Telegram") from None


def current_user(x_telegram_init_data: str = Header(default="")) -> dict:
    return validate_init_data(x_telegram_init_data)


def optional_user(x_telegram_init_data: str = Header(default="")):
    return validate_init_data(x_telegram_init_data) if x_telegram_init_data else None
