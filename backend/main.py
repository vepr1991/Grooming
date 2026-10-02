import hmac
import logging
from uuid import UUID

import psycopg
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
from db import one, required, transaction
from logic import change_status, digest, enqueue, now, schedule_reminder
from routers import bookings, master

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("crm")
app = FastAPI(title="Grooming CRM", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.APP_URL],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-Telegram-Init-Data"],
)
app.include_router(master.router)
app.include_router(bookings.router)


@app.exception_handler(psycopg.errors.ExclusionViolation)
def overlap_error(request, exc):
    return JSONResponse(status_code=409, content={"detail": "Время уже занято. Обновите расписание."})


@app.exception_handler(psycopg.errors.UniqueViolation)
def duplicate_error(request, exc):
    return JSONResponse(
        status_code=409,
        content={"detail": "Такая запись уже существует: проверьте телефон, компанию или ключ запроса."},
    )


@app.exception_handler(psycopg.errors.DeadlockDetected)
def deadlock_error(request, exc):
    return JSONResponse(
        status_code=409, content={"detail": "Данные изменились одновременно. Повторите запрос."}
    )


@app.exception_handler(psycopg.Error)
def db_error(request, exc):
    logger.error("Database operation failed: %s", type(exc).__name__)
    return JSONResponse(status_code=503, content={"detail": "Сервис временно недоступен. Повторите позже."})


@app.get("/health")
def health():
    with transaction() as c:
        required(c, "SELECT name FROM crm.schema_migrations ORDER BY name DESC LIMIT 1")
        c.execute("SELECT 1 FROM organizations LIMIT 1")
    return {"status": "ok"}


@app.get("/api/config")
def public_config():
    return {"bot_username": config.TELEGRAM_BOT_USERNAME}


@app.post("/api/webhook")
def webhook(update: dict, x_telegram_bot_api_secret_token: str = Header(default="")):
    if not config.TELEGRAM_WEBHOOK_SECRET or not hmac.compare_digest(
        x_telegram_bot_api_secret_token, config.TELEGRAM_WEBHOOK_SECRET
    ):
        raise HTTPException(403, "Недопустимый webhook")
    if type(update.get("update_id")) is not int:
        raise HTTPException(422, "Некорректное обновление")
    with transaction() as c:
        if not one(
            c,
            "INSERT INTO telegram_updates(id) VALUES (%s) ON CONFLICT DO NOTHING RETURNING id",
            (update["update_id"],),
        ):
            return {"ok": True}
        message = update.get("message") or {}
        sender = message.get("from") or {}
        chat = message.get("chat") or {}
        text = message.get("text", "")
        if text.startswith("/start") and chat.get("type") == "private" and sender.get("id") == chat.get("id"):
            uid = sender["id"]
            c.execute(
                "INSERT INTO bot_users(tg_id) VALUES (%s) ON CONFLICT(tg_id) DO UPDATE SET reachable=true",
                (uid,),
            )
            parts = text.split(maxsplit=1)
            if len(parts) == 2 and parts[1].startswith("notify_"):
                token = parts[1][7:]
                ap = one(
                    c,
                    "SELECT * FROM appointments WHERE notification_token_hash=%s FOR UPDATE",
                    (digest(token),),
                )
                if (
                    ap
                    and (ap["client_tg_id"] is None or ap["client_tg_id"] == uid)
                    and ap["start_time"] > now()
                    and ap["status"] in ("pending", "confirmed")
                ):
                    ap = one(
                        c,
                        "UPDATE appointments SET client_tg_id=%s,notification_token_hash=NULL WHERE id=%s RETURNING *",
                        (uid, ap["id"]),
                    )
                    schedule_reminder(c, ap)
                    enqueue(
                        c,
                        f"update:{update['update_id']}",
                        uid,
                        "Уведомления о записи подключены.",
                        {
                            "inline_keyboard": [
                                [{"text": "Отменить запись", "callback_data": f"cancel:{ap['id']}"}]
                            ]
                        },
                    )
                else:
                    enqueue(
                        c,
                        f"update:{update['update_id']}",
                        uid,
                        "Ссылка недействительна или уведомления уже подключены.",
                    )
            else:
                enqueue(
                    c,
                    f"update:{update['update_id']}",
                    uid,
                    "Откройте CRM для управления салоном.",
                    {"inline_keyboard": [[{"text": "Открыть CRM", "web_app": {"url": config.APP_URL}}]]},
                )
        call = update.get("callback_query") or {}
        if str(call.get("data", "")).startswith("cancel:"):
            try:
                aid = UUID(call["data"][7:])
            except ValueError:
                return {"ok": True}
            uid = (call.get("from") or {}).get("id")
            ap = one(c, "SELECT * FROM appointments WHERE id=%s FOR UPDATE", (aid,))
            if (
                ap
                and ap["client_tg_id"] == uid
                and ap["status"] in ("pending", "confirmed")
                and ap["start_time"] > now()
            ):
                change_status(c, ap, "canceled", uid)
            elif uid:
                enqueue(
                    c,
                    f"update:{update['update_id']}",
                    uid,
                    "Отмена недоступна: запись завершена, уже отменена или принадлежит другому клиенту.",
                )
    return {"ok": True}
