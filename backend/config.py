"""Configuration is loaded without connecting to external services at import time."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))
DATABASE_URL = os.getenv("DATABASE_URL", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "").lstrip("@")
APP_URL = os.getenv("APP_URL", "http://localhost:5173").rstrip("/")
OPERATOR_IDS = {int(v) for v in os.getenv("OPERATOR_IDS", "").split(",") if v.strip()}
AUTH_MAX_AGE = 86400
SUBSCRIPTION_PRICE_MINOR = int(os.getenv("SUBSCRIPTION_PRICE_MINOR", "0"))
SUBSCRIPTION_CURRENCY = os.getenv("SUBSCRIPTION_CURRENCY", "KZT")
PAYMENT_INSTRUCTIONS = os.getenv("PAYMENT_INSTRUCTIONS", "Обратитесь к оператору сервиса для продления.")
