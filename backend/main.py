import time
import telebot
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import bot, scheduler, logger, BACKEND_URL, TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID, supabase
from logic import check_upcoming_appointments
from routers import master, bookings


# --- BOT HANDLERS ---
@bot.message_handler(commands=['start'])
def h_start(m):
    markup = telebot.types.InlineKeyboardMarkup()
    markup.add(telebot.types.InlineKeyboardButton("🚀 Открыть приложение", web_app=telebot.types.WebAppInfo(
        "https://grooming-react-front.onrender.com")))
    # Универсальное приветствие (раз у нас не только груминг)
    bot.reply_to(m, f"Привет! Я бот для удобной онлайн-записи.\nЖми кнопку ниже 👇", reply_markup=markup)


@bot.callback_query_handler(func=lambda call: call.data.startswith('approve_') or call.data.startswith('reject_'))
def handle_admin_decision(call):
    if str(call.message.chat.id) != str(ADMIN_CHAT_ID): return
    action, salon_id = call.data.split('_')
    try:
        salon_res = supabase.table("salons").select("telegram_chat_id, name").eq("id", salon_id).single().execute()
        if not salon_res.data:
            bot.answer_callback_query(call.id, "Салон не найден")
            return
        master_chat_id = salon_res.data['telegram_chat_id']
        if action == 'approve':
            supabase.table("salons").update({"is_approved": True}).eq("id", salon_id).execute()
            bot.edit_message_text(f"✅ Мастер <b>{salon_res.data['name']}</b> одобрен!", call.message.chat.id,
                                  call.message.id, parse_mode="HTML")
            bot.send_message(master_chat_id, "🎉 <b>Ваш аккаунт подтвержден!</b>\n\nТеперь вы можете принимать записи.",
                             parse_mode="HTML")
        elif action == 'reject':
            bot.edit_message_text(f"❌ Мастер <b>{salon_res.data['name']}</b> отклонен.", call.message.chat.id,
                                  call.message.id, parse_mode="HTML")
            bot.send_message(master_chat_id, "😔 К сожалению, ваша регистрация отклонена администратором.")
    except Exception as e:
        logger.error(f"Approval error: {e}")
        bot.answer_callback_query(call.id, "Ошибка обработки")


# --- ОБРАБОТЧИК ОТМЕНЫ ЗАПИСИ КЛИЕНТОМ ---
@bot.callback_query_handler(func=lambda call: call.data.startswith('cancel_'))
def handle_client_cancel(call):
    appointment_id = call.data.split('_')[1]
    try:
        # 1. Ищем запись в базе
        res = supabase.table("appointments").select("*, salons(name, telegram_chat_id)").eq("id",
                                                                                            appointment_id).single().execute()
        if not res.data:
            bot.answer_callback_query(call.id, "Запись не найдена")
            return

        appt = res.data

        # 2. Проверяем, не отменена ли она уже
        if appt['status'] == 'canceled':
            bot.answer_callback_query(call.id, "Запись уже отменена", show_alert=True)
            return

        # 3. Меняем статус на отмененный
        supabase.table("appointments").update({"status": "canceled"}).eq("id", appointment_id).execute()

        # 4. Обновляем сообщение у клиента (убираем кнопку, добавляем текст)
        bot.edit_message_text(
            f"{call.message.html_text}\n\n<i>🚫 Вы самостоятельно отменили эту запись.</i>",
            call.message.chat.id,
            call.message.id,
            parse_mode="HTML"
        )
        bot.answer_callback_query(call.id, "Запись успешно отменена")

        # 5. Уведомляем мастера об отмене
        master_chat_id = appt['salons']['telegram_chat_id']
        if master_chat_id:
            # Парсим время безопасно
            start_dt = datetime.fromisoformat(appt["start_time"].replace("Z", "+00:00"))
            time_str = start_dt.strftime('%d.%m.%Y в %H:%M')

            client_name = appt.get('client_name', 'Клиент')
            pet_name = appt.get('pet_name') or (appt.get('metadata') or {}).get('petName')
            display_name = f"{client_name} (Питомец: {pet_name})" if pet_name else client_name

            bot.send_message(
                master_chat_id,
                f"⚠️ <b>Отмена записи!</b>\n\nКлиент <b>{display_name}</b> отменил запись на {time_str}.\nОкошко снова свободно.",
                parse_mode="HTML"
            )

    except Exception as e:
        logger.error(f"Client cancel error: {e}")
        bot.answer_callback_query(call.id, "Произошла ошибка при отмене")


# --- LIFESPAN ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Webhook
    if BACKEND_URL and TELEGRAM_BOT_TOKEN:
        try:
            webhook_url = f"{BACKEND_URL}/api/webhook"
            logger.info(f"🔗 Setting webhook to: {webhook_url}")
            bot.remove_webhook()
            time.sleep(1)
            bot.set_webhook(url=webhook_url)
        except Exception as e:
            logger.error(f"❌ Webhook failed: {e}")
    else:
        logger.warning("⚠️ BACKEND_URL не задан! Бот работает в ограниченном режиме.")

    # Scheduler
    logger.info("⏰ Starting scheduler...")
    scheduler.add_job(check_upcoming_appointments, 'interval', minutes=5)
    scheduler.start()

    yield

    logger.info("🛑 Shutting down...")
    try:
        bot.remove_webhook()
        scheduler.shutdown()
    except:
        pass


# --- APP SETUP ---
app = FastAPI(title="Grooming API", version="5.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Подключаем роутеры
app.include_router(master.router)
app.include_router(bookings.router)


@app.get("/")
def health_check(): return {"status": "active", "version": "5.0"}


@app.post("/api/webhook")
def process_webhook(update: dict):
    if update:
        update_obj = telebot.types.Update.de_json(update)
        bot.process_new_updates([update_obj])
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    import os

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))