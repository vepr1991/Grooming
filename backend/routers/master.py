import secrets
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

import config
from auth import current_user
from db import all_rows, one, required, transaction
from logic import audit, digest, membership, now, require_subscription, scope_member, subscription
from schemas import (
    AcceptInvite,
    ClientInput,
    ExceptionInput,
    InviteInput,
    MemberInput,
    OrganizationInput,
    PetInput,
    ScheduleInput,
    ServiceInput,
    SubscriptionPayment,
)

router = APIRouter(prefix="/api")
MANAGERS = {"owner", "admin"}


@router.get("/me")
def me(user=Depends(current_user)):
    with transaction() as c:
        organizations = all_rows(
            c,
            """SELECT o.*,m.role,m.id AS member_id FROM organizations o JOIN members m ON m.org_id=o.id
          WHERE m.tg_id=%s AND m.active ORDER BY o.created_at""",
            (user["id"],),
        )
        return {
            "user": user,
            "organizations": organizations,
            "is_operator": user["id"] in config.OPERATOR_IDS,
        }


@router.post("/organizations", status_code=201)
def register(data: OrganizationInput, user=Depends(current_user)):
    with transaction() as c:
        org = one(
            c,
            """INSERT INTO organizations(owner_tg_id,name,address,phone,timezone,currency,slot_step)
          VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (user["id"], data.name, data.address, data.phone, data.timezone, data.currency, data.slot_step),
        )
        c.execute("INSERT INTO subscriptions(org_id) VALUES (%s)", (org["id"],))
        member = one(
            c,
            "INSERT INTO members(org_id,tg_id,name,role) VALUES (%s,%s,%s,'owner') RETURNING *",
            (org["id"], user["id"], user.get("first_name", "Владелец")),
        )
        default_schedule(c, org["id"], member["id"])
        audit(c, org["id"], user["id"], "organization.created", org["id"])
        return org


def default_schedule(c, org_id, member_id):
    for day in range(5):
        c.execute("INSERT INTO schedules VALUES (%s,%s,%s,'10:00','19:00')", (org_id, member_id, day))


@router.get("/organizations/{org_id}")
def get_org(org_id: UUID, user=Depends(current_user)):
    with transaction() as c:
        member = membership(c, org_id, user)
        return {
            "organization": required(c, "SELECT * FROM organizations WHERE id=%s", (org_id,)),
            "membership": member,
            "subscription": subscription(c, org_id),
        }


@router.put("/organizations/{org_id}")
def update_org(org_id: UUID, data: OrganizationInput, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user, {"owner"}, write=True)
        org = required(c, "SELECT * FROM organizations WHERE id=%s FOR UPDATE", (org_id,))
        if data.currency != org["currency"] and one(
            c, "SELECT id FROM appointments WHERE org_id=%s LIMIT 1", (org_id,)
        ):
            raise HTTPException(409, "После первой записи валюту менять нельзя")
        result = one(
            c,
            "UPDATE organizations SET name=%s,address=%s,phone=%s,timezone=%s,currency=%s,slot_step=%s WHERE id=%s RETURNING *",
            (data.name, data.address, data.phone, data.timezone, data.currency, data.slot_step, org_id),
        )
        audit(c, org_id, user["id"], "organization.updated", org_id)
        return result


@router.get("/organizations/{org_id}/members")
def members(org_id: UUID, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user)
        return all_rows(
            c, "SELECT id,name,role,active,bookable FROM members WHERE org_id=%s ORDER BY name", (org_id,)
        )


@router.put("/organizations/{org_id}/members/{member_id}")
def update_member(org_id: UUID, member_id: UUID, data: MemberInput, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user, {"owner"}, write=True)
        old = required(c, "SELECT * FROM members WHERE org_id=%s AND id=%s FOR UPDATE", (org_id, member_id))
        if (old["role"] == "owner" and (data.role != "owner" or not data.active)) or (
            old["role"] != "owner" and data.role == "owner"
        ):
            raise HTTPException(422, "Нельзя изменить владельца")
        if (not data.active or not data.bookable) and one(
            c,
            "SELECT id FROM appointments WHERE member_id=%s AND start_time>now() AND status IN ('pending','confirmed') LIMIT 1",
            (member_id,),
        ):
            raise HTTPException(409, "Сначала перенесите или отмените будущие записи сотрудника")
        result = one(
            c,
            "UPDATE members SET name=%s,role=%s,active=%s,bookable=%s WHERE id=%s RETURNING id,name,role,active,bookable",
            (data.name, data.role, data.active, data.bookable, member_id),
        )
        audit(c, org_id, user["id"], "member.updated", member_id)
        return result


@router.post("/organizations/{org_id}/invitations")
def invite(org_id: UUID, data: InviteInput, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user, {"owner"}, write=True)
        token = secrets.token_urlsafe(24)
        c.execute(
            "INSERT INTO invitations(token_hash,org_id,name,role) VALUES (%s,%s,%s,%s)",
            (digest(token), org_id, data.name, data.role),
        )
        audit(c, org_id, user["id"], "invitation.created", details={"role": data.role})
        return {
            "token": token,
            "link": f"https://t.me/{config.TELEGRAM_BOT_USERNAME}?startapp=invite_{token}"
            if config.TELEGRAM_BOT_USERNAME
            else None,
        }


@router.post("/invitations/accept")
def accept_invite(data: AcceptInvite, user=Depends(current_user)):
    with transaction() as c:
        invite = required(
            c, "SELECT * FROM invitations WHERE token_hash=%s FOR UPDATE", (digest(data.token),)
        )
        if invite["used_by"] or invite["expires_at"] <= now():
            raise HTTPException(410, "Приглашение использовано или просрочено")
        require_subscription(c, invite["org_id"])
        existing = one(
            c, "SELECT id FROM members WHERE org_id=%s AND tg_id=%s", (invite["org_id"], user["id"])
        )
        if existing:
            raise HTTPException(409, "Вы уже состоите в этой компании")
        member = one(
            c,
            "INSERT INTO members(org_id,tg_id,name,role) VALUES (%s,%s,%s,%s) RETURNING id",
            (invite["org_id"], user["id"], invite["name"], invite["role"]),
        )
        default_schedule(c, invite["org_id"], member["id"])
        c.execute("UPDATE invitations SET used_by=%s WHERE token_hash=%s", (user["id"], digest(data.token)))
        audit(c, invite["org_id"], user["id"], "invitation.accepted", member["id"])
        return {"org_id": invite["org_id"]}


@router.get("/organizations/{org_id}/members/{member_id}/schedule")
def get_schedule(org_id: UUID, member_id: UUID, user=Depends(current_user)):
    with transaction() as c:
        m = membership(c, org_id, user)
        scope_member(m, member_id)
        required(c, "SELECT id FROM members WHERE org_id=%s AND id=%s", (org_id, member_id))
        return {
            "days": all_rows(
                c,
                "SELECT weekday,start_time,end_time FROM schedules WHERE member_id=%s ORDER BY weekday",
                (member_id,),
            ),
            "exceptions": all_rows(
                c,
                "SELECT day,start_time,end_time FROM schedule_exceptions WHERE member_id=%s ORDER BY day",
                (member_id,),
            ),
        }


@router.put("/organizations/{org_id}/members/{member_id}/schedule")
def set_schedule(org_id: UUID, member_id: UUID, data: ScheduleInput, user=Depends(current_user)):
    with transaction() as c:
        m = membership(c, org_id, user, write=True)
        scope_member(m, member_id)
        required(c, "SELECT id FROM members WHERE org_id=%s AND id=%s FOR UPDATE", (org_id, member_id))
        c.execute("DELETE FROM schedules WHERE member_id=%s", (member_id,))
        for day in data.days:
            c.execute(
                "INSERT INTO schedules VALUES (%s,%s,%s,%s,%s)",
                (org_id, member_id, day.weekday, day.start_time, day.end_time),
            )
        audit(c, org_id, user["id"], "schedule.updated", member_id)
        return {"success": True}


@router.put("/organizations/{org_id}/members/{member_id}/exceptions")
def set_exception(org_id: UUID, member_id: UUID, data: ExceptionInput, user=Depends(current_user)):
    with transaction() as c:
        m = membership(c, org_id, user, write=True)
        scope_member(m, member_id)
        required(c, "SELECT id FROM members WHERE org_id=%s AND id=%s FOR UPDATE", (org_id, member_id))
        c.execute(
            """INSERT INTO schedule_exceptions VALUES (%s,%s,%s,%s,%s) ON CONFLICT(member_id,day)
          DO UPDATE SET start_time=excluded.start_time,end_time=excluded.end_time""",
            (org_id, member_id, data.day, data.start_time, data.end_time),
        )
        audit(c, org_id, user["id"], "schedule.exception", member_id)
        return {"success": True}


@router.delete("/organizations/{org_id}/members/{member_id}/exceptions/{day}")
def delete_exception(org_id: UUID, member_id: UUID, day: str, user=Depends(current_user)):
    from datetime import date

    try:
        parsed = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(422, "Некорректная дата")
    with transaction() as c:
        m = membership(c, org_id, user, write=True)
        scope_member(m, member_id)
        required(c, "SELECT id FROM members WHERE org_id=%s AND id=%s FOR UPDATE", (org_id, member_id))
        c.execute("DELETE FROM schedule_exceptions WHERE member_id=%s AND day=%s", (member_id, parsed))
        audit(c, org_id, user["id"], "schedule.exception_deleted", member_id)
        return {"success": True}


@router.get("/organizations/{org_id}/services")
def services(org_id: UUID, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user)
        return all_rows(
            c,
            "SELECT s.*,ARRAY(SELECT member_id FROM member_services WHERE service_id=s.id) AS member_ids FROM services s WHERE org_id=%s ORDER BY title",
            (org_id,),
        )


def save_service(c, org_id, data, sid=None):
    ids = list(set(data.member_ids))
    if len(
        all_rows(
            c,
            "SELECT id FROM members WHERE org_id=%s AND id=ANY(%s) AND active AND bookable FOR SHARE",
            (org_id, ids),
        )
    ) != len(ids):
        raise HTTPException(422, "Выберите действующих исполнителей")
    if sid:
        result = required(
            c,
            "UPDATE services SET title=%s,price_minor=%s,duration_minutes=%s,active=%s WHERE org_id=%s AND id=%s RETURNING *",
            (data.title, data.price_minor, data.duration_minutes, data.active, org_id, sid),
        )
        c.execute("DELETE FROM member_services WHERE service_id=%s", (sid,))
    else:
        result = one(
            c,
            "INSERT INTO services(org_id,title,price_minor,duration_minutes,active) VALUES (%s,%s,%s,%s,%s) RETURNING *",
            (org_id, data.title, data.price_minor, data.duration_minutes, data.active),
        )
    for mid in ids:
        c.execute("INSERT INTO member_services VALUES (%s,%s,%s)", (org_id, mid, result["id"]))
    return result


@router.post("/organizations/{org_id}/services", status_code=201)
def create_service(org_id: UUID, data: ServiceInput, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user, MANAGERS, write=True)
        row = save_service(c, org_id, data)
        audit(c, org_id, user["id"], "service.created", row["id"])
        return row


@router.put("/organizations/{org_id}/services/{service_id}")
def update_service(org_id: UUID, service_id: UUID, data: ServiceInput, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user, MANAGERS, write=True)
        row = save_service(c, org_id, data, service_id)
        audit(c, org_id, user["id"], "service.updated", service_id)
        return row


@router.get("/organizations/{org_id}/clients")
def clients(org_id: UUID, q: str = "", user=Depends(current_user)):
    with transaction() as c:
        m = membership(c, org_id, user)
        return all_rows(
            c,
            """SELECT cl.*, (SELECT count(*) FROM appointments a WHERE a.client_id=cl.id AND a.status='completed') AS visits,
          (SELECT max(start_time) FROM appointments a WHERE a.client_id=cl.id AND a.status='completed') AS last_visit
          FROM clients cl WHERE cl.org_id=%s AND (cl.name ILIKE %s OR cl.phone LIKE %s OR EXISTS(SELECT 1 FROM pets p WHERE p.client_id=cl.id AND p.name ILIKE %s))
          AND (%s OR EXISTS(SELECT 1 FROM appointments a WHERE a.client_id=cl.id AND a.member_id=%s)) ORDER BY cl.name LIMIT 500""",
            (org_id, f"%{q[:100]}%", f"%{q[:100]}%", f"%{q[:100]}%", m["role"] != "groomer", m["id"]),
        )


def client_access(c, org_id, cid, m):
    row = required(c, "SELECT * FROM clients WHERE org_id=%s AND id=%s", (org_id, cid))
    if m["role"] == "groomer" and not one(
        c, "SELECT id FROM appointments WHERE client_id=%s AND member_id=%s LIMIT 1", (cid, m["id"])
    ):
        raise HTTPException(403, "Клиент не назначен вам")
    return row


@router.get("/organizations/{org_id}/clients/{client_id}")
def client_detail(org_id: UUID, client_id: UUID, user=Depends(current_user)):
    with transaction() as c:
        m = membership(c, org_id, user)
        row = client_access(c, org_id, client_id, m)
        return {
            **row,
            "pets": all_rows(c, "SELECT * FROM pets WHERE client_id=%s ORDER BY name", (client_id,)),
            "history": all_rows(
                c,
                """SELECT a.*,m.name AS member_name,p.name AS pet_name FROM appointments a JOIN members m ON m.id=a.member_id
                  LEFT JOIN pets p ON p.id=a.pet_id WHERE a.client_id=%s AND (%s OR a.member_id=%s) ORDER BY a.start_time DESC""",
                (client_id, m["role"] != "groomer", m["id"]),
            ),
        }


@router.post("/organizations/{org_id}/clients", status_code=201)
def create_client(org_id: UUID, data: ClientInput, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user, MANAGERS, write=True)
        row = one(
            c,
            "INSERT INTO clients(org_id,name,phone,notes) VALUES (%s,%s,%s,%s) RETURNING *",
            (org_id, data.name, data.phone, data.notes),
        )
        audit(c, org_id, user["id"], "client.created", row["id"])
        return row


@router.put("/organizations/{org_id}/clients/{client_id}")
def update_client(org_id: UUID, client_id: UUID, data: ClientInput, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user, MANAGERS, write=True)
        row = required(
            c,
            "UPDATE clients SET name=%s,phone=%s,notes=%s WHERE org_id=%s AND id=%s RETURNING *",
            (data.name, data.phone, data.notes, org_id, client_id),
        )
        audit(c, org_id, user["id"], "client.updated", client_id)
        return row


@router.post("/organizations/{org_id}/clients/{client_id}/pets", status_code=201)
def create_pet(org_id: UUID, client_id: UUID, data: PetInput, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user, MANAGERS, write=True)
        required(c, "SELECT id FROM clients WHERE org_id=%s AND id=%s", (org_id, client_id))
        row = one(
            c,
            "INSERT INTO pets(org_id,client_id,name,breed,notes) VALUES (%s,%s,%s,%s,%s) RETURNING *",
            (org_id, client_id, data.name, data.breed, data.notes),
        )
        audit(c, org_id, user["id"], "pet.created", row["id"])
        return row


@router.put("/organizations/{org_id}/pets/{pet_id}")
def update_pet(org_id: UUID, pet_id: UUID, data: PetInput, user=Depends(current_user)):
    with transaction() as c:
        membership(c, org_id, user, MANAGERS, write=True)
        row = required(
            c,
            "UPDATE pets SET name=%s,breed=%s,notes=%s WHERE org_id=%s AND id=%s RETURNING *",
            (data.name, data.breed, data.notes, org_id, pet_id),
        )
        audit(c, org_id, user["id"], "pet.updated", pet_id)
        return row


@router.get("/organizations/{org_id}/export")
def export_org(org_id: UUID, user=Depends(current_user)):
    with transaction(repeatable_read=True) as c:
        membership(c, org_id, user, MANAGERS)
        tables = [
            "members",
            "clients",
            "pets",
            "services",
            "member_services",
            "schedules",
            "schedule_exceptions",
            "appointments",
            "appointment_items",
            "payments",
            "subscriptions",
            "subscription_payments",
            "audit_log",
        ]
        from psycopg import sql

        result = {
            table: all_rows(
                c, sql.SQL("SELECT * FROM {} WHERE org_id=%s").format(sql.Identifier(table)), (org_id,)
            )
            for table in tables
        }
        # Internal notification credentials must not enter customer exports.
        for app in result["appointments"]:
            app.pop("notification_token_hash", None)
        result["organization"] = required(c, "SELECT * FROM organizations WHERE id=%s", (org_id,))
        return result


@router.get("/operator/organizations")
def operator_orgs(q: str = "", user=Depends(current_user)):
    if user["id"] not in config.OPERATOR_IDS:
        raise HTTPException(403, "Доступ оператора запрещён")
    with transaction() as c:
        return all_rows(
            c,
            """SELECT o.*,s.trial_ends_at,s.paid_until FROM organizations o JOIN subscriptions s ON s.org_id=o.id
          WHERE o.name ILIKE %s OR o.id::text=%s ORDER BY o.created_at DESC LIMIT 200""",
            (f"%{q[:100]}%", q),
        )


@router.post("/operator/organizations/{org_id}/renew")
def renew(org_id: UUID, data: SubscriptionPayment, user=Depends(current_user)):
    if user["id"] not in config.OPERATOR_IDS:
        raise HTTPException(403, "Доступ оператора запрещён")
    with transaction() as c:
        sub = required(c, "SELECT * FROM subscriptions WHERE org_id=%s FOR UPDATE", (org_id,))
        previous = one(c, "SELECT * FROM subscription_payments WHERE request_key=%s", (data.request_key,))
        if previous:
            if (
                previous["org_id"] != org_id
                or previous["amount_minor"] != data.amount_minor
                or previous["reference"] != data.reference
            ):
                raise HTTPException(409, "Ключ оплаты уже использован")
            return previous
        end = max(now(), sub["trial_ends_at"], sub["paid_until"] or sub["trial_ends_at"]) + timedelta(days=30)
        row = one(
            c,
            """INSERT INTO subscription_payments(org_id,amount_minor,currency,reference,request_key,operator_id,paid_until)
          VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (
                org_id,
                data.amount_minor,
                config.SUBSCRIPTION_CURRENCY,
                data.reference,
                data.request_key,
                user["id"],
                end,
            ),
        )
        c.execute("UPDATE subscriptions SET paid_until=%s WHERE org_id=%s", (end, org_id))
        audit(c, org_id, user["id"], "subscription.renewed", row["id"], {"paid_until": end.isoformat()})
        return row
