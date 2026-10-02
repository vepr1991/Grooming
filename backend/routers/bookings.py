from datetime import date, datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from auth import current_user, optional_user
from db import all_rows, one, required, transaction
from logic import (
    audit,
    change_status,
    create_booking,
    digest,
    hours_for,
    membership,
    notify_appointment,
    now,
    rate_limit,
    require_subscription,
    scope_member,
    service_selection,
    subscription,
    validate_time,
)
from schemas import BlockInput, BookingInput, ManualBooking, MoveInput, PaymentInput, StatusInput

router = APIRouter(prefix="/api")
MANAGERS = {"owner", "admin"}


@router.get("/public/{org_id}")
def storefront(org_id: UUID):
    with transaction() as c:
        org = required(
            c,
            "SELECT id,name,address,phone,timezone,currency,slot_step FROM organizations WHERE id=%s",
            (org_id,),
        )
        return {
            "organization": org,
            "booking_enabled": subscription(c, org_id)["active"],
            "services": all_rows(
                c,
                """SELECT s.id,s.title,s.price_minor,s.duration_minutes,
                  ARRAY(SELECT ms.member_id FROM member_services ms JOIN members m ON m.id=ms.member_id WHERE ms.service_id=s.id AND m.active AND m.bookable) AS member_ids
                  FROM services s WHERE org_id=%s AND active ORDER BY title""",
                (org_id,),
            ),
            "members": all_rows(
                c,
                "SELECT id,name FROM members WHERE org_id=%s AND active AND bookable ORDER BY name",
                (org_id,),
            ),
        }


@router.get("/public/{org_id}/slots")
def slots(
    org_id: UUID, member_id: UUID, day: date, service_ids: list[UUID] = Query(min_length=1, max_length=10)
):
    with transaction() as c:
        require_subscription(c, org_id)
        org = required(c, "SELECT * FROM organizations WHERE id=%s", (org_id,))
        selected = service_selection(c, org_id, member_id, list(set(service_ids)))
        tz = ZoneInfo(org["timezone"])
        today = now().astimezone(tz).date()
        if day < today or day > today + timedelta(days=365):
            raise HTTPException(422, "Дата вне доступного периода")
        hours = hours_for(c, member_id, day)
        if not hours or hours["start_time"] is None:
            return []
        start = datetime.combine(day, hours["start_time"], tz).astimezone(timezone.utc)
        finish = datetime.combine(day, hours["end_time"], tz).astimezone(timezone.utc)
        duration = timedelta(minutes=sum(s["duration_minutes"] for s in selected))
        busy = all_rows(
            c,
            "SELECT start_time,end_time FROM appointments WHERE member_id=%s AND status!='canceled' AND start_time<%s AND end_time>%s",
            (member_id, finish, start),
        )
        result = []
        while start + duration <= finish:
            if start > now() and not any(
                start < r["end_time"] and start + duration > r["start_time"] for r in busy
            ):
                result.append({"start_time": start, "end_time": start + duration})
            start += timedelta(minutes=org["slot_step"])
        return result


@router.post("/public/{org_id}/bookings", status_code=201)
def public_book(org_id: UUID, data: BookingInput, request: Request, user=Depends(optional_user)):
    # Commit rate-limit counters independently, including rejected booking attempts.
    with transaction() as c:
        rate_limit(c, "booking:ip:" + digest(request.client.host if request.client else "unknown"), 30, 3600)
        rate_limit(c, f"booking:phone:{org_id}:" + digest(data.client.phone), 10, 3600)
    with transaction() as c:
        return create_booking(c, org_id, data, user)


@router.post("/organizations/{org_id}/appointments", status_code=201)
def manual_book(org_id: UUID, data: ManualBooking, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user, MANAGERS, write=True)
        return create_booking(c, org_id, data, user, internal=True)


@router.get("/organizations/{org_id}/appointments")
def appointments(org_id: UUID, day: date | None = None, user=Depends(current_user)):
    with transaction() as c:
        m = membership(c, org_id, user)
        org = required(c, "SELECT timezone FROM organizations WHERE id=%s", (org_id,))
        local_day = day or now().astimezone(ZoneInfo(org["timezone"])).date()
        start = datetime.combine(local_day, datetime.min.time(), ZoneInfo(org["timezone"]))
        end = start + timedelta(days=1)
        return all_rows(
            c,
            """SELECT a.id,a.org_id,a.member_id,a.client_id,a.pet_id,a.start_time,a.end_time,a.status,a.total_minor,a.reason,a.version,
          (a.client_tg_id IS NOT NULL AND EXISTS(SELECT 1 FROM bot_users bu WHERE bu.tg_id=a.client_tg_id AND bu.reachable)) AS notifications_enabled,cl.name AS client_name,cl.phone AS client_phone,p.name AS pet_name,p.breed,p.notes AS pet_notes,m.name AS member_name,
          COALESCE((SELECT sum(CASE WHEN kind='payment' THEN amount_minor ELSE -amount_minor END) FROM payments WHERE appointment_id=a.id),0) AS paid_minor,
          ARRAY(SELECT title FROM appointment_items WHERE appointment_id=a.id) AS services
          FROM appointments a JOIN members m ON m.id=a.member_id LEFT JOIN clients cl ON cl.id=a.client_id LEFT JOIN pets p ON p.id=a.pet_id
          WHERE a.org_id=%s AND a.start_time<%s AND a.end_time>%s AND (%s OR a.member_id=%s) ORDER BY a.start_time""",
            (org_id, end, start, m["role"] != "groomer", m["id"]),
        )


@router.patch("/organizations/{org_id}/appointments/{appointment_id}/status")
def status(org_id: UUID, appointment_id: UUID, data: StatusInput, user=Depends(current_user)):
    with transaction() as c:
        m = membership(c, org_id, user)
        app = required(
            c, "SELECT * FROM appointments WHERE org_id=%s AND id=%s FOR UPDATE", (org_id, appointment_id)
        )
        scope_member(m, app["member_id"])
        if app["version"] != data.version:
            raise HTTPException(409, "Запись изменена. Обновите календарь.")
        change_status(c, app, data.status, user["id"])
        return {"success": True}


@router.patch("/organizations/{org_id}/appointments/{appointment_id}/move")
def move(org_id: UUID, appointment_id: UUID, data: MoveInput, user=Depends(current_user)):
    with transaction() as c:
        m = membership(c, org_id, user, write=True)
        app = required(
            c, "SELECT * FROM appointments WHERE org_id=%s AND id=%s FOR UPDATE", (org_id, appointment_id)
        )
        scope_member(m, app["member_id"])
        scope_member(m, data.member_id)
        if app["version"] != data.version:
            raise HTTPException(409, "Запись изменена. Обновите календарь.")
        if app["status"] not in ("pending", "confirmed"):
            raise HTTPException(409, "Перенос недоступен для этого статуса")
        ids = [
            r["service_id"]
            for r in all_rows(
                c, "SELECT service_id FROM appointment_items WHERE appointment_id=%s", (appointment_id,)
            )
        ]
        service_selection(c, org_id, data.member_id, ids)
        end = data.start_time + (app["end_time"] - app["start_time"])
        org = required(c, "SELECT * FROM organizations WHERE id=%s", (org_id,))
        validate_time(c, org, data.member_id, data.start_time, end)
        row = one(
            c,
            "UPDATE appointments SET member_id=%s,start_time=%s,end_time=%s,version=version+1 WHERE id=%s RETURNING *",
            (data.member_id, data.start_time, end, appointment_id),
        )
        audit(c, org_id, user["id"], "appointment.moved", appointment_id)
        notify_appointment(c, row, "Запись перенесена")
        return {"success": True}


@router.post("/organizations/{org_id}/blocks", status_code=201)
def block(org_id: UUID, data: BlockInput, user=Depends(current_user)):
    with transaction() as c:
        m = membership(c, org_id, user, write=True)
        scope_member(m, data.member_id)
        required(
            c,
            "SELECT id FROM members WHERE org_id=%s AND id=%s AND active FOR SHARE",
            (org_id, data.member_id),
        )
        if data.start_time <= now() or data.start_time > now() + timedelta(days=365):
            raise HTTPException(422, "Выберите будущее время в пределах года")
        row = one(
            c,
            "INSERT INTO appointments(org_id,member_id,start_time,end_time,status,reason) VALUES (%s,%s,%s,%s,'blocked',%s) RETURNING id",
            (
                org_id,
                data.member_id,
                data.start_time,
                data.start_time + timedelta(minutes=data.duration_minutes),
                data.reason,
            ),
        )
        audit(c, org_id, user["id"], "block.created", row["id"])
        return row


@router.get("/organizations/{org_id}/appointments/{appointment_id}/payments")
def payments(org_id: UUID, appointment_id: UUID, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user, MANAGERS)
        required(c, "SELECT id FROM appointments WHERE org_id=%s AND id=%s", (org_id, appointment_id))
        return all_rows(
            c, "SELECT * FROM payments WHERE appointment_id=%s ORDER BY created_at", (appointment_id,)
        )


@router.post("/organizations/{org_id}/appointments/{appointment_id}/payments", status_code=201)
def add_payment(org_id: UUID, appointment_id: UUID, data: PaymentInput, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user, MANAGERS, write=True)
        app = required(
            c, "SELECT * FROM appointments WHERE org_id=%s AND id=%s FOR UPDATE", (org_id, appointment_id)
        )
        if not app["client_id"]:
            raise HTTPException(422, "У перерыва нет оплаты")
        previous = one(
            c, "SELECT * FROM payments WHERE org_id=%s AND request_key=%s", (org_id, data.request_key)
        )
        if previous:
            if previous["appointment_id"] != appointment_id or any(
                previous[k] != getattr(data, k) for k in ("amount_minor", "kind", "method", "note")
            ):
                raise HTTPException(409, "Ключ оплаты уже использован")
            return previous
        balance = one(
            c,
            "SELECT COALESCE(sum(CASE WHEN kind='payment' THEN amount_minor ELSE -amount_minor END),0) AS amount FROM payments WHERE appointment_id=%s",
            (appointment_id,),
        )["amount"]
        if data.kind == "refund" and data.amount_minor > balance:
            raise HTTPException(422, "Возврат превышает полученную сумму")
        if data.kind == "payment" and data.amount_minor + balance > app["total_minor"]:
            raise HTTPException(422, "Оплата превышает стоимость визита")
        row = one(
            c,
            "INSERT INTO payments(org_id,appointment_id,amount_minor,kind,method,note,request_key,created_by) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (
                org_id,
                appointment_id,
                data.amount_minor,
                data.kind,
                data.method,
                data.note,
                data.request_key,
                user["id"],
            ),
        )
        audit(c, org_id, user["id"], "payment.created", row["id"])
        return row


@router.get("/organizations/{org_id}/analytics")
def analytics(org_id: UUID, start: date, end: date, user=Depends(current_user)):
    if end < start or (end - start).days > 366:
        raise HTTPException(422, "Выберите период до одного года")
    with transaction() as c:
        membership(c, org_id, user, MANAGERS)
        org = required(c, "SELECT timezone FROM organizations WHERE id=%s", (org_id,))
        tz = ZoneInfo(org["timezone"])
        a = datetime.combine(start, datetime.min.time(), tz)
        b = datetime.combine(end + timedelta(days=1), datetime.min.time(), tz)
        result = one(
            c,
            """SELECT count(*) FILTER(WHERE status!='blocked') AS appointments,
          count(*) FILTER(WHERE status='completed') AS completed,
          COALESCE(sum(total_minor) FILTER(WHERE status='completed'),0) AS completed_value_minor
          FROM appointments WHERE org_id=%s AND start_time>=%s AND start_time<%s""",
            (org_id, a, b),
        )
        result.update(
            one(
                c,
                """SELECT COALESCE(sum(amount_minor) FILTER(WHERE kind='payment'),0) AS receipts_minor,
          COALESCE(sum(amount_minor) FILTER(WHERE kind='refund'),0) AS refunds_minor FROM payments WHERE org_id=%s AND created_at>=%s AND created_at<%s""",
                (org_id, a, b),
            )
        )
        result["outstanding_minor"] = one(
            c,
            """SELECT COALESCE(sum(a.total_minor-COALESCE(p.paid,0)),0) AS debt FROM appointments a
          LEFT JOIN (SELECT appointment_id,sum(CASE WHEN kind='payment' THEN amount_minor ELSE -amount_minor END) AS paid FROM payments GROUP BY appointment_id) p ON p.appointment_id=a.id
          WHERE a.org_id=%s AND a.status='completed' AND a.start_time>=%s AND a.start_time<%s""",
            (org_id, a, b),
        )["debt"]
        return result
