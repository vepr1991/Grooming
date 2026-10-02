"""Run separately: python worker.py. Durable retries; one row is locked per delivery."""

import logging
import signal
import time

import httpx

import config
from db import one, transaction

logger = logging.getLogger("worker")
running = True


def deliver_one(sender=None):
    with transaction() as c:
        row = one(
            c,
            """SELECT * FROM outbox WHERE delivered_at IS NULL AND failed_at IS NULL AND available_at<=now()
          ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1""",
        )
        if not row:
            return False
        if row["appointment_id"]:
            ap = one(
                c,
                "SELECT version,status,start_time>now() AS upcoming FROM appointments WHERE id=%s",
                (row["appointment_id"],),
            )
            if (
                not ap
                or ap["version"] != row["appointment_version"]
                or ap["status"] != "confirmed"
                or not ap["upcoming"]
            ):
                c.execute(
                    "UPDATE outbox SET failed_at=now(),last_error='obsolete reminder' WHERE id=%s",
                    (row["id"],),
                )
                return True
        payload = {"chat_id": row["chat_id"], "text": row["text"]}
        if row["reply_markup"]:
            payload["reply_markup"] = row["reply_markup"]
        try:
            if sender:
                body = sender(payload)
            else:
                with httpx.Client(timeout=10) as client:
                    response = client.post(
                        f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage", json=payload
                    )
                    body = response.json()
            if body.get("ok"):
                c.execute(
                    "UPDATE outbox SET delivered_at=now(),attempts=attempts+1,last_error=NULL WHERE id=%s",
                    (row["id"],),
                )
            else:
                code = body.get("error_code", 500)
                attempts = row["attempts"] + 1
                terminal = code in (400, 403) or attempts >= 8
                retry = max(
                    2 ** min(attempts, 10) * 15, int((body.get("parameters") or {}).get("retry_after", 0))
                )
                c.execute(
                    "UPDATE outbox SET attempts=%s,available_at=now()+%s*interval '1 second',failed_at=CASE WHEN %s THEN now() ELSE NULL END,last_error=%s WHERE id=%s",
                    (attempts, retry, terminal, f"Telegram error {code}", row["id"]),
                )
                if code == 403:
                    c.execute("UPDATE bot_users SET reachable=false WHERE tg_id=%s", (row["chat_id"],))
        except (httpx.HTTPError, ValueError):
            attempts = row["attempts"] + 1
            c.execute(
                "UPDATE outbox SET attempts=%s,available_at=now()+%s*interval '1 second',failed_at=CASE WHEN %s THEN now() ELSE NULL END,last_error='network error' WHERE id=%s",
                (attempts, 2 ** min(attempts, 10) * 15, attempts >= 8, row["id"]),
            )
            logger.warning("Notification delivery failed; outbox=%s", row["id"])
        return True


def stop(*_):
    global running
    running = False


if __name__ == "__main__":
    if not config.TELEGRAM_BOT_TOKEN:
        raise RuntimeError("Set TELEGRAM_BOT_TOKEN")
    logging.basicConfig(level=logging.INFO)
    # httpx request URLs include the bot token; keep third-party access logs disabled.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    while running:
        try:
            if not deliver_one():
                time.sleep(2)
        except Exception as exc:
            logger.error("Worker iteration failed: %s", type(exc).__name__)
            time.sleep(5)
