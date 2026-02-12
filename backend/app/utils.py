import httpx
import io
import html
from PIL import Image
from .config import settings  # <--- [FIX] Импортируем settings вместо BOT_TOKEN

async def send_telegram_message(chat_id: int, text: str):
    """
    Отправляет сообщение в Telegram через Bot API (Асинхронно).
    """
    if not settings.BOT_TOKEN: # [FIX] Берем токен из settings
        print("WARNING: BOT_TOKEN not set, notification skipped")
        return

    url = f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    }

    try:
        # Используем асинхронный клиент, чтобы не блокировать работу сервера
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=5)
            if response.status_code != 200:
                print(f"Telegram API Error: {response.text}")
    except Exception as e:
        print(f"Failed to send notification: {e}")

def compress_image(image_bytes: bytes, max_size: int = 1024, quality: int = 80) -> bytes:
    """
    Сжимает изображение и конвертирует в JPEG.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))

        # Если PNG с прозрачностью -> делаем белый фон
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        # Ресайз
        if max(img.size) > max_size:
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

        output = io.BytesIO()
        img.save(output, format='JPEG', quality=quality, optimize=True)
        return output.getvalue()
    except Exception as e:
        print(f"Error compressing image: {e}")
        return image_bytes

def escape_html(text: str) -> str:
    """
    Экранирует спецсимволы для HTML-разметки Telegram.
    """
    if text is None:
        return ""
    return html.escape(str(text))