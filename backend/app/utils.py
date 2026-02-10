import requests
import io
import html  # [NEW] Импорт
from PIL import Image
from .config import BOT_TOKEN


# [NEW] Функция для очистки текста перед отправкой в Telegram
def escape_html(text: str) -> str:
    """
    Экранирует спецсимволы (<, >, &), чтобы они не ломали HTML-разметку Telegram.
    Если text None, возвращает пустую строку.
    """
    if text is None:
        return ""
    return html.escape(str(text))


def compress_image(image_bytes: bytes, max_size: int = 1024, quality: int = 80) -> bytes:
    """
    Сжимает изображение:
    1. Уменьшает размер (resize), сохраняя пропорции.
    2. Конвертирует в JPEG.
    3. Оптимизирует вес файла.
    """
    try:
        # Открываем изображение из байтов
        img = Image.open(io.BytesIO(image_bytes))

        # Если изображение имеет прозрачность (PNG), делаем белый фон
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        # Уменьшаем, если оно огромное
        if max(img.size) > max_size:
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

        # Сохраняем обратно в байты как JPEG
        output_buffer = io.BytesIO()
        img.save(output_buffer, format='JPEG', quality=quality, optimize=True)

        return output_buffer.getvalue()
    except Exception as e:
        print(f"Error compressing image: {e}")
        # Если ошибка, возвращаем оригинал
        return image_bytes


def send_telegram_message(chat_id: int, text: str):
    """Отправляет сообщение в Telegram через Bot API"""
    if not BOT_TOKEN:
        print("WARNING: BOT_TOKEN not set, notification skipped")
        return

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"  # Важно: мы используем HTML, поэтому данные нужно экранировать
    }

    try:
        response = requests.post(url, json=payload, timeout=5)
        if response.status_code != 200:
            print(f"Telegram API Error: {response.text}")
    except Exception as e:
        print(f"Failed to send notification: {e}")