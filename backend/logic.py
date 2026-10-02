"""Domain rules shared by HTTP endpoints and the Telegram worker."""

import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from psycopg.types.json import Jsonb

import config
from db import all_rows, one, required

UTC = timezone.utc


def now():
    return datetime.now(UTC)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def audit(conn, org_id, actor, action, entity=None, details=None):
    conn.execute(
        "INSERT INTO audit_log(org_id,actor_id,action,entity_id,details) VALUES (%s,%s,%s,%s,%s)",
        (org_id, actor, action, str(entity) if entity else None, Jsonb(details or {})),
    )


def membership(conn, org_id, user, roles=None, write=False):
    member = one(conn, "SELECT * FROM members WHERE org_id=%s AND tg_id=%s AND active", (org_id, user["id"]))
    if not member or (roles and member["role"] not in roles):
        raise HTTPException(403, "Недостаточно прав")
    if write:
        require_subscription(conn, org_id)
    return member


def require_subscription(conn, org_id):
    # Shared lock ensures an extension and this decision cannot race.
    row = required(conn, "SELECT * FROM subscriptions WHERE org_id=%s FOR SHARE", (org_id,))
    if max(row["trial_ends_at"], row["paid_until"] or row["trial_ends_at"]) <= now():
        raise HTTPException(402, "Подписка закончилась. Доступны просмотр, экспорт и отмена записей.")
    return row


def scope_member(member, target):
    if member["role"] == "groomer" and str(member["id"]) != str(target):
        raise HTTPException(403, "Доступно только собственное расписание")


def subscription(conn, org_id):
    row = required(conn, "SELECT * FROM subscriptions WHERE org_id=%s", (org_id,))
    end = max(row["trial_ends_at"], row["paid_until"] or row["trial_ends_at"])
    return {
        **row,
        "ends_at": end,
        "active": end > now(),
        "status": "expired"
        if end <= now()
        else ("paid" if row["paid_until"] and row["paid_until"] > now() else "trial"),
        "price_minor": config.SUBSCRIPTION_PRICE_MINOR,
        "currency": config.SUBSCRIPTION_CURRENCY,
        "payment_instructions": config.PAYMENT_INSTRUCTIONS,
    }


def rate_limit(conn, key, limit=10, seconds=60):
    row = one(
        conn,
        """INSERT INTO rate_limits(key) VALUES (%s)
      ON CONFLICT(key) DO UPDATE SET
        hits=CASE WHEN rate_limits.window_start < now() - %s * interval '1 second' THEN 1 ELSE rate_limits.hits+1 END,
        window_start=CASE WHEN rate_limits.window_start < now() - %s * interval '1 second' THEN now() ELSE rate_limits.window_start END
      RETURNING hits""",
        (key, seconds, seconds),
    )
    if row["hits"] > limit:
        raise HTTPException(429, "Слишком много запросов. Попробуйте позже.")


def hours_for(conn, member_id, day):
    exception = one(
        conn,
        "SELECT start_time,end_time FROM schedule_exceptions WHERE member_id=%s AND day=%s",
        (member_id, day),
    )
    if exception is not None:
        return exception
    return one(
        conn,
        "SELECT start_time,end_time FROM schedules WHERE member_id=%s AND weekday=%s",
        (member_id, day.weekday()),
    )


def service_selection(conn, org_id, member_id, service_ids):
    required(
        conn,
        "SELECT id FROM members WHERE org_id=%s AND id=%s AND active AND bookable FOR SHARE",
        (org_id, member_id),
    )
    services = all_rows(
        conn,
        """SELECT s.* FROM services s JOIN member_services ms ON ms.service_id=s.id
      WHERE s.org_id=%s AND ms.member_id=%s AND s.active AND s.id=ANY(%s) ORDER BY s.id FOR SHARE OF s""",
        (org_id, member_id, service_ids),
    )
    if len(services) != len(service_ids):
        raise HTTPException(422, "Услуги недоступны выбранному сотруднику")
    return services


def validate_time(conn, org, member_id, start, end):
    if start <= now() or start > now() + timedelta(days=365):
        raise HTTPException(422, "Выберите будущее время в пределах года")
    tz = ZoneInfo(org["timezone"])
    local_start, local_end = start.astimezone(tz), end.astimezone(tz)
    hours = hours_for(conn, member_id, local_start.date())
    if not hours or hours["start_time"] is None or local_start.date() != local_end.date():
        raise HTTPException(422, "Сотрудник не работает в это время")
    if local_start.time() < hours["start_time"] or local_end.time() > hours["end_time"]:
        raise HTTPException(422, "Запись выходит за рабочий график")
    offset = (
        datetime.combine(local_start.date(), local_start.time())
        - datetime.combine(local_start.date(), hours["start_time"])
    ).total_seconds()
    if offset % (org["slot_step"] * 60):
        raise HTTPException(422, "Выберите время из доступных слотов")


def enqueue(conn, key, chat_id, text, markup=None, appointment=None, version=None, available=None):
    conn.execute(
        """INSERT INTO outbox(dedupe_key,chat_id,text,reply_markup,appointment_id,appointment_version,available_at)
      VALUES (%s,%s,%s,%s,%s,%s,COALESCE(%s,now())) ON CONFLICT(dedupe_key) DO NOTHING""",
        (key, chat_id, text[:4000], Jsonb(markup) if markup else None, appointment, version, available),
    )


def notify_appointment(conn, app, event):
    org = required(conn, "SELECT * FROM organizations WHERE id=%s", (app["org_id"],))
    client = one(conn, "SELECT name FROM clients WHERE id=%s", (app["client_id"],))
    when = app["start_time"].astimezone(ZoneInfo(org["timezone"])).strftime("%d.%m.%Y %H:%M")
    titles = ", ".join(
        r["title"]
        for r in all_rows(conn, "SELECT title FROM appointment_items WHERE appointment_id=%s", (app["id"],))
    )
    message = (
        f"{event}\n{org['name']}\n{when} ({org['timezone']})\n{client['name'] if client else ''}\n{titles}"
    )
    recipients = all_rows(
        conn,
        "SELECT tg_id FROM members WHERE org_id=%s AND active AND (role IN ('owner','admin') OR id=%s)",
        (org["id"], app["member_id"]),
    )
    for row in recipients:
        enqueue(
            conn,
            f"{app['id']}:{app['version']}:staff:{row['tg_id']}",
            row["tg_id"],
            message,
            {"inline_keyboard": [[{"text": "Открыть CRM", "web_app": {"url": config.APP_URL}}]]},
        )
    if app["client_tg_id"]:
        markup = (
            {"inline_keyboard": [[{"text": "Отменить запись", "callback_data": f"cancel:{app['id']}"}]]}
            if app["status"] in ("pending", "confirmed")
            else None
        )
        enqueue(conn, f"{app['id']}:{app['version']}:client", app["client_tg_id"], message, markup)
    schedule_reminder(conn, app, org, when)


def schedule_reminder(conn, app, org=None, when=None):
    if app["status"] != "confirmed" or not app["client_tg_id"] or app["start_time"] <= now():
        return
    org = org or required(conn, "SELECT * FROM organizations WHERE id=%s", (app["org_id"],))
    when = when or app["start_time"].astimezone(ZoneInfo(org["timezone"])).strftime("%d.%m.%Y %H:%M")
    enqueue(
        conn,
        f"{app['id']}:{app['version']}:reminder",
        app["client_tg_id"],
        f"Напоминание о записи: {org['name']}\n{when} ({org['timezone']})",
        {"inline_keyboard": [[{"text": "Отменить запись", "callback_data": f"cancel:{app['id']}"}]]},
        app["id"],
        app["version"],
        max(now(), app["start_time"] - timedelta(hours=1)),
    )


def create_booking(conn, org_id, data, user=None, internal=False):
    payload = data.model_dump(mode="json")
    fingerprint = digest(
        json.dumps(
            {"data": payload, "actor": user["id"] if user else None, "internal": internal}, sort_keys=True
        )
    )
    # Serializes identical request keys, including retries during an in-flight transaction.
    conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (f"{org_id}:{data.request_key}",))
    previous = one(
        conn, "SELECT * FROM booking_requests WHERE org_id=%s AND request_key=%s", (org_id, data.request_key)
    )
    if previous:
        if previous["fingerprint"] != fingerprint:
            raise HTTPException(409, "Ключ запроса уже использован для других данных")
        return booking_result(previous["appointment_id"], previous["notification_token"])
    require_subscription(conn, org_id)
    org = required(conn, "SELECT * FROM organizations WHERE id=%s FOR SHARE", (org_id,))
    # Schedule writes lock the same employee row exclusively.
    selected = service_selection(conn, org_id, data.member_id, data.service_ids)
    end = data.start_time + timedelta(minutes=sum(s["duration_minutes"] for s in selected))
    validate_time(conn, org, data.member_id, data.start_time, end)
    client_id = getattr(data, "client_id", None) if internal else None
    if client_id:
        required(conn, "SELECT id FROM clients WHERE org_id=%s AND id=%s", (org_id, client_id))
    else:
        # Public submissions never overwrite private notes or existing identity details.
        client_id = one(
            conn,
            """INSERT INTO clients(org_id,name,phone,notes) VALUES (%s,%s,%s,%s)
          ON CONFLICT(org_id,phone) DO UPDATE SET phone=excluded.phone RETURNING id""",
            (org_id, data.client.name, data.client.phone, data.client.notes if internal else ""),
        )["id"]
    pet_id = getattr(data, "pet_id", None) if internal else None
    if pet_id:
        required(
            conn,
            "SELECT id FROM pets WHERE org_id=%s AND client_id=%s AND id=%s",
            (org_id, client_id, pet_id),
        )
    else:
        pet = one(
            conn,
            "SELECT id FROM pets WHERE org_id=%s AND client_id=%s AND lower(name)=lower(%s) AND lower(breed)=lower(%s)",
            (org_id, client_id, data.pet.name, data.pet.breed),
        )
        pet_id = (
            pet["id"]
            if pet
            else one(
                conn,
                "INSERT INTO pets(org_id,client_id,name,breed,notes) VALUES (%s,%s,%s,%s,%s) RETURNING id",
                (org_id, client_id, data.pet.name, data.pet.breed, data.pet.notes if internal else ""),
            )["id"]
        )
    token = secrets.token_urlsafe(24)
    reachable = user and one(conn, "SELECT tg_id FROM bot_users WHERE tg_id=%s AND reachable", (user["id"],))
    client_tg = user["id"] if reachable and not internal else None
    app = one(
        conn,
        """INSERT INTO appointments(org_id,member_id,client_id,pet_id,start_time,end_time,status,total_minor,client_tg_id,notification_token_hash)
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
        (
            org_id,
            data.member_id,
            client_id,
            pet_id,
            data.start_time,
            end,
            "confirmed" if internal else "pending",
            sum(s["price_minor"] for s in selected),
            client_tg,
            digest(token),
        ),
    )
    for service in selected:
        conn.execute(
            "INSERT INTO appointment_items(org_id,appointment_id,service_id,title,price_minor,duration_minutes) VALUES (%s,%s,%s,%s,%s,%s)",
            (
                org_id,
                app["id"],
                service["id"],
                service["title"],
                service["price_minor"],
                service["duration_minutes"],
            ),
        )
    conn.execute(
        "INSERT INTO booking_requests VALUES (%s,%s,%s,%s,%s)",
        (org_id, data.request_key, fingerprint, app["id"], token),
    )
    audit(conn, org_id, user["id"] if user else 0, "appointment.created", app["id"])
    notify_appointment(conn, app, "Новая запись")
    return booking_result(app["id"], token)


def booking_result(appointment_id, token):
    return {
        "id": appointment_id,
        "notification_link": f"https://t.me/{config.TELEGRAM_BOT_USERNAME}?start=notify_{token}"
        if config.TELEGRAM_BOT_USERNAME
        else None,
    }


TRANSITIONS = {
    "pending": {"confirmed", "canceled"},
    "confirmed": {"completed", "canceled", "no_show"},
    "canceled": {"pending"},
    "completed": set(),
    "no_show": set(),
    "blocked": {"canceled"},
}


def change_status(conn, app, status, actor):
    if status not in TRANSITIONS[app["status"]]:
        raise HTTPException(409, "Недопустимый переход статуса")
    if status != "canceled":
        require_subscription(conn, app["org_id"])
    if status in ("completed", "no_show") and app["start_time"] > now():
        raise HTTPException(422, "Визит ещё не начался")
    if status in ("pending", "confirmed"):
        if not app["client_id"] or not app["pet_id"]:
            raise HTTPException(422, "Перерыв нельзя восстановить как запись")
        org = required(conn, "SELECT * FROM organizations WHERE id=%s", (app["org_id"],))
        ids = [
            r["service_id"]
            for r in all_rows(
                conn, "SELECT service_id FROM appointment_items WHERE appointment_id=%s", (app["id"],)
            )
        ]
        service_selection(conn, app["org_id"], app["member_id"], ids)
        validate_time(conn, org, app["member_id"], app["start_time"], app["end_time"])
    updated = one(
        conn,
        "UPDATE appointments SET status=%s,version=version+1 WHERE id=%s RETURNING *",
        (status, app["id"]),
    )
    audit(conn, app["org_id"], actor, "appointment.status", app["id"], {"from": app["status"], "to": status})
    if app["client_id"]:
        labels = {
            "pending": "Запись восстановлена",
            "confirmed": "Запись подтверждена",
            "canceled": "Запись отменена",
            "completed": "Визит завершён",
            "no_show": "Отмечена неявка",
        }
        notify_appointment(conn, updated, labels[status])
    return updated
