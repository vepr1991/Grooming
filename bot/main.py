import asyncio
import os
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.enums import ParseMode  # [NEW] Импортируем для HTML
from aiogram.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton

# Если вы используете .env файл, раскомментируйте эти строки:
# from dotenv import load_dotenv
# load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")  # https://your-domain.com

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    args = message.text.split(" ")

    # --- Режим Клиента (если перешли по ссылке t.me/bot?start=123) ---
    if len(args) > 1 and args[1].isdigit():
        master_id = args[1]

        # Мы явно добавляем ?start_param=... в URL
        # WebApp при открытии увидит этот параметр в адресной строке
        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="📅 Записаться онлайн",
                # Важно: используем start_param для передачи данных в WebApp, если платформа поддерживает,
                # или просто GET параметр в URL как у вас
                web_app=WebAppInfo(url=f"{WEBAPP_URL}/client.html?start={master_id}")
            )
        ]])
        await message.answer(f"Вы перешли по ссылке к мастеру #{master_id}. Нажмите кнопку:", reply_markup=kb)
        return

    # --- Режим Мастера (просто /start) ---
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🔧 Админка мастера",
            web_app=WebAppInfo(url=f"{WEBAPP_URL}/admin.html")
        )
    ]])
    
    await message.answer("Привет, Мастер! Управляй своим салоном здесь.", reply_markup=kb)

    # Генерация красивой ссылки для мастера
    bot_info = await bot.get_me()
    my_link = f"https://t.me/{bot_info.username}?start={message.from_user.id}"
    
    # [FIX] Используем HTML разметку
    await message.answer(
        f"Твоя ссылка для клиентов:\n"
        f"👉 <a href='{my_link}'>Ссылка для записи</a>\n\n"
        f"Нажми ниже, чтобы скопировать:\n"
        f"<code>{my_link}</code>", 
        parse_mode=ParseMode.HTML
    )


async def main():
    print("Bot started...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
