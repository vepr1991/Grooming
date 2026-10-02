from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from conftest import signed

from db import one, transaction
from worker import deliver_one


def future(day_offset=2, hour=10):
    d = datetime.now(ZoneInfo("Asia/Almaty")) + timedelta(days=day_offset)
    while d.weekday() > 4:
        d += timedelta(days=1)
    return d.replace(hour=hour, minute=0, second=0, microsecond=0)


def payload(m, s, start=None, phone="+77771234567"):
    return {
        "member_id": m["id"],
        "service_ids": [s["id"]],
        "start_time": (start or future()).isoformat(),
        "client": {"name": "Анна", "phone": phone},
        "pet": {"name": "Боня", "breed": "Шпиц"},
        "request_key": str(uuid4()),
    }


def book(client, o, m, s, **kwargs):
    d = payload(m, s, **kwargs)
    r = client.post(f"/api/public/{o['id']}/bookings", json=d)
    assert r.status_code == 201, r.text
    return r.json(), d


def expire(o):
    with transaction() as c:
        c.execute(
            "UPDATE subscriptions SET trial_ends_at=now()-interval '1 day',paid_until=NULL WHERE org_id=%s",
            (o["id"],),
        )


def invite(client, o, uid=202, role="groomer"):
    r = client.post(
        f"/api/organizations/{o['id']}/invitations", headers=signed(), json={"name": "Мастер", "role": role}
    )
    token = r.json()["token"]
    response = client.post("/api/invitations/accept", headers=signed(uid), json={"token": token})
    assert response.status_code == 200, response.text
    members = client.get(f"/api/organizations/{o['id']}/members", headers=signed()).json()
    return next(m for m in members if m["name"] == "Мастер"), token


def test_auth_and_tenant_isolation(client, salon):
    o, m, s = salon()
    other, _, _ = salon(303)
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers=signed(age=90000)).status_code == 401
    assert client.get("/api/me", headers=signed(age=-100)).status_code == 401
    forged = signed()
    forged["X-Telegram-Init-Data"] += "x"
    assert client.get("/api/me", headers=forged).status_code == 401
    for suffix in ("clients", "appointments", "services", "members", "export", ""):
        assert (
            client.get(
                f"/api/organizations/{other['id']}" + ("/" + suffix if suffix else ""), headers=signed()
            ).status_code
            == 403
        )
    assert client.post("/api/organizations", headers=signed(), json={"name": "Duplicate"}).status_code == 409


def test_catalog_server_prices_and_validation(client, salon):
    o, m, s = salon()
    data = payload(m, s)
    data["price_minor"] = 1
    assert client.post(f"/api/public/{o['id']}/bookings", json=data).status_code == 422
    data.pop("price_minor")
    data["service_ids"] = []
    assert client.post(f"/api/public/{o['id']}/bookings", json=data).status_code == 422
    other, om, os = salon(303)
    data["service_ids"] = [os["id"]]
    assert client.post(f"/api/public/{o['id']}/bookings", json=data).status_code == 422
    ap, _ = book(client, o, m, s)
    with transaction() as c:
        row = one(c, "SELECT * FROM appointments WHERE id=%s", (ap["id"],))
        assert row["total_minor"] == 800000
        assert (row["end_time"] - row["start_time"]).total_seconds() == 3600


def test_concurrent_bookings_and_idempotency(client, salon):
    o, m, s = salon()
    data = payload(m, s)

    def send(d):
        return client.post(f"/api/public/{o['id']}/bookings", json=d)

    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(send, [data, data]))
    assert [r.status_code for r in responses] == [201, 201]
    assert responses[0].json() == responses[1].json()
    data["pet"]["name"] = "Другая"
    assert send(data).status_code == 409
    d1 = payload(m, s, future(hour=12), "+77770000001")
    d2 = payload(m, s, future(hour=12), "+77770000002")
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(send, [d1, d2]))
    assert sorted(r.status_code for r in responses) == [201, 409]
    with transaction() as c:
        assert one(c, "SELECT count(*) AS n FROM appointments")["n"] == 2
        assert one(c, "SELECT count(*) AS n FROM clients")["n"] == 2


def test_members_parallel_and_role_limits(client, salon):
    o, m, s = salon()
    g, token = invite(client, o)
    assert (
        client.post("/api/invitations/accept", headers=signed(404), json={"token": token}).status_code == 410
    )
    s2 = client.post(
        f"/api/organizations/{o['id']}/services",
        headers=signed(),
        json={"title": "Мытьё", "price_minor": 200000, "duration_minutes": 60, "member_ids": [g["id"]]},
    ).json()
    a, _ = book(client, o, m, s)
    b, _ = book(client, o, g, s2, phone="+77770000002")
    rows = client.get(
        f"/api/organizations/{o['id']}/appointments?day={future().date()}", headers=signed(202)
    ).json()
    assert len(rows) == 1 and rows[0]["id"] == b["id"]
    assert (
        client.patch(
            f"/api/organizations/{o['id']}/appointments/{a['id']}/status",
            headers=signed(202),
            json={"status": "confirmed", "version": 1},
        ).status_code
        == 403
    )
    assert client.get(f"/api/organizations/{o['id']}/export", headers=signed(202)).status_code == 403
    assert (
        client.post(
            f"/api/organizations/{o['id']}/clients",
            headers=signed(202),
            json={"name": "Тест", "phone": "+77770000000"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/organizations/{o['id']}/invitations", headers=signed(202), json={"name": "Тест"}
        ).status_code
        == 403
    )
    assert (
        client.put(
            f"/api/organizations/{o['id']}/members/{g['id']}",
            headers=signed(),
            json={**{k: g[k] for k in ("name", "role", "bookable")}, "active": False},
        ).status_code
        == 409
    )


def test_expired_subscription_and_operator_renew(client, salon):
    o, m, s = salon()
    a, d = book(client, o, m, s)
    expire(o)
    base = f"/api/organizations/{o['id']}"
    assert client.get(base + "/clients", headers=signed()).status_code == 200
    assert client.get(base + "/export", headers=signed()).status_code == 200
    assert (
        client.post(f"/api/public/{o['id']}/bookings", json=payload(m, s, future(hour=12))).status_code == 402
    )
    assert (
        client.post(
            base + "/clients", headers=signed(), json={"name": "Анна", "phone": "+77770000000"}
        ).status_code
        == 402
    )
    assert (
        client.patch(
            base + f"/appointments/{a['id']}/status",
            headers=signed(),
            json={"status": "canceled", "version": 1},
        ).status_code
        == 200
    )
    assert client.get(f"/api/public/{o['id']}").json()["booking_enabled"] is False
    pay = {"amount_minor": 100000, "reference": "Bank receipt 123", "request_key": str(uuid4())}
    assert (
        client.post(f"/api/operator/organizations/{o['id']}/renew", headers=signed(), json=pay).status_code
        == 403
    )
    r = client.post(f"/api/operator/organizations/{o['id']}/renew", headers=signed(900), json=pay)
    assert r.status_code == 200, r.text
    repeat = client.post(f"/api/operator/organizations/{o['id']}/renew", headers=signed(900), json=pay)
    assert repeat.json() == r.json()
    end = datetime.fromisoformat(r.json()["paid_until"])
    assert timedelta(days=29) < end - datetime.now(timezone.utc) < timedelta(days=31)
    assert client.get(f"/api/public/{o['id']}").json()["booking_enabled"] is True


def test_schedule_slots_and_move_conflict(client, salon):
    o, m, s = salon()
    start = future()
    query = f"/api/public/{o['id']}/slots?member_id={m['id']}&day={start.date()}&service_ids={s['id']}"
    slots = client.get(query).json()
    assert len(slots) == 17
    assert datetime.fromisoformat(slots[0]["start_time"]).astimezone(ZoneInfo("Asia/Almaty")).hour == 10
    a, _ = book(client, o, m, s)
    b, _ = book(client, o, m, s, start=future(hour=12), phone="+77770000002")
    base = f"/api/organizations/{o['id']}"
    assert (
        client.patch(
            base + f"/appointments/{a['id']}/move",
            headers=signed(),
            json={"member_id": m["id"], "start_time": future(hour=12).isoformat(), "version": 1},
        ).status_code
        == 409
    )
    assert (
        client.patch(
            base + f"/appointments/{a['id']}/move",
            headers=signed(),
            json={"member_id": m["id"], "start_time": future(hour=14).isoformat(), "version": 1},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            base + f"/appointments/{a['id']}/status",
            headers=signed(),
            json={"status": "confirmed", "version": 1},
        ).status_code
        == 409
    )
    assert (
        client.put(
            base + f"/members/{m['id']}/exceptions", headers=signed(), json={"day": str(start.date())}
        ).status_code
        == 200
    )
    assert client.get(query).json() == []
    assert (
        client.post(f"/api/public/{o['id']}/bookings", json=payload(m, s, future(hour=16))).status_code == 422
    )
    assert (
        client.delete(base + f"/members/{m['id']}/exceptions/{start.date()}", headers=signed()).status_code
        == 200
    )
    assert client.get(query).json()


def test_clients_pets_notes_and_history(client, salon):
    o, m, s = salon()
    a, d = book(client, o, m, s)
    base = f"/api/organizations/{o['id']}"
    cl = client.get(base + "/clients", headers=signed()).json()[0]
    assert cl["last_visit"] is None and cl["visits"] == 0
    assert (
        client.put(
            base + "/clients/" + cl["id"],
            headers=signed(),
            json={"name": "Анна", "phone": "8 (777) 123-45-67", "notes": "Приватная заметка"},
        ).status_code
        == 200
    )
    d = payload(m, s, future(hour=12))
    d["client"]["notes"] = "Подмена"
    d["pet"]["name"] = "Рекс"
    assert client.post(f"/api/public/{o['id']}/bookings", json=d).status_code == 201
    detail = client.get(base + "/clients/" + cl["id"], headers=signed()).json()
    assert detail["notes"] == "Приватная заметка" and len(detail["pets"]) == 2 and len(detail["history"]) == 2
    assert (
        client.post(
            base + "/clients", headers=signed(), json={"name": "Дубль", "phone": "87771234567"}
        ).status_code
        == 409
    )


def test_payments_refunds_reports(client, salon):
    o, m, s = salon()
    a, d = book(client, o, m, s)
    base = f"/api/organizations/{o['id']}/appointments/{a['id']}"
    pay = {"amount_minor": 500000, "request_key": str(uuid4()), "kind": "payment", "method": "cash"}
    r = client.post(base + "/payments", headers=signed(), json=pay)
    assert r.status_code == 201, r.text
    assert client.post(base + "/payments", headers=signed(), json=pay).json() == r.json()
    assert (
        client.post(
            base + "/payments", headers=signed(), json={**pay, "request_key": str(uuid4())}
        ).status_code
        == 422
    )
    refund = {**pay, "kind": "refund", "amount_minor": 100000, "request_key": str(uuid4())}
    assert client.post(base + "/payments", headers=signed(), json=refund).status_code == 201
    assert (
        client.post(
            base + "/payments",
            headers=signed(),
            json={**refund, "amount_minor": 600000, "request_key": str(uuid4())},
        ).status_code
        == 422
    )
    assert (
        client.patch(
            base + "/status", headers=signed(), json={"status": "confirmed", "version": 1}
        ).status_code
        == 200
    )
    assert (
        client.patch(
            base + "/status", headers=signed(), json={"status": "completed", "version": 2}
        ).status_code
        == 422
    )
    with transaction() as c:
        c.execute(
            "UPDATE appointments SET start_time=now()-interval '2 hours',end_time=now()-interval '1 hour' WHERE id=%s",
            (a["id"],),
        )
    assert (
        client.patch(
            base + "/status", headers=signed(), json={"status": "completed", "version": 2}
        ).status_code
        == 200
    )
    today = datetime.now(ZoneInfo("Asia/Almaty")).date()
    r = client.get(
        f"/api/organizations/{o['id']}/analytics?start={today - timedelta(days=1)}&end={today}",
        headers=signed(),
    ).json()
    assert (
        r["completed_value_minor"] == 800000
        and r["receipts_minor"] == 500000
        and r["refunds_minor"] == 100000
        and r["outstanding_minor"] == 400000
    )


def test_webhook_protection_notifications_cancel(client, salon):
    o, m, s = salon()
    a, d = book(client, o, m, s)
    assert client.post("/api/webhook", json={"update_id": 1}).status_code == 403
    token = a["notification_link"].split("notify_")[1]
    headers = {"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"}
    update = {
        "update_id": 1,
        "message": {
            "from": {"id": 700},
            "chat": {"id": 700, "type": "private"},
            "text": "/start notify_" + token,
        },
    }
    assert client.post("/api/webhook", headers=headers, json=update).status_code == 200
    assert client.post("/api/webhook", headers=headers, json=update).status_code == 200
    callback = {"update_id": 2, "callback_query": {"from": {"id": 701}, "data": "cancel:" + a["id"]}}
    assert client.post("/api/webhook", headers=headers, json=callback).status_code == 200
    with transaction() as c:
        assert one(c, "SELECT status FROM appointments WHERE id=%s", (a["id"],))["status"] == "pending"
    callback["update_id"] = 3
    callback["callback_query"]["from"]["id"] = 700
    assert client.post("/api/webhook", headers=headers, json=callback).status_code == 200
    with transaction() as c:
        assert one(c, "SELECT status FROM appointments WHERE id=%s", (a["id"],))["status"] == "canceled"
        assert one(c, "SELECT count(*) AS n FROM telegram_updates")["n"] == 3


def test_outbox_retry_and_no_repeat(client, salon):
    o, m, s = salon()
    book(client, o, m, s)
    assert deliver_one(lambda _: {"ok": False, "error_code": 429, "parameters": {"retry_after": 100}})
    with transaction() as c:
        row = one(c, "SELECT * FROM outbox ORDER BY id LIMIT 1")
        assert (
            row["attempts"] == 1
            and row["delivered_at"] is None
            and row["available_at"] > datetime.now(timezone.utc)
        )
        c.execute("UPDATE outbox SET available_at=now()")
    sent = []
    while deliver_one(lambda payload: sent.append(payload) or {"ok": True}):
        pass
    count = len(sent)
    assert count > 0 and not deliver_one(lambda p: sent.append(p) or {"ok": True})
    assert len(sent) == count


def test_stale_reminder_not_sent(client, salon):
    o, m, s = salon()
    a, _ = book(client, o, m, s)
    with transaction() as c:
        c.execute(
            "INSERT INTO outbox(dedupe_key,chat_id,text,appointment_id,appointment_version) VALUES ('stale',123,'test',%s,0)",
            (a["id"],),
        )
        c.execute("UPDATE outbox SET delivered_at=now() WHERE dedupe_key!='stale'")
    sent = []
    assert deliver_one(lambda p: sent.append(p) or {"ok": True})
    assert not sent


def test_rls_no_browser_access(client, salon):
    salon()
    with transaction() as c:
        assert (
            one(
                c,
                "SELECT count(*) AS n FROM pg_tables WHERE schemaname='crm' AND tablename!='schema_migrations' AND NOT rowsecurity",
            )["n"]
            == 0
        )
        # Validate grants rather than assuming anon/authenticated roles exist in plain PostgreSQL.
        assert not one(
            c,
            "SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='crm' AND grantee='PUBLIC' LIMIT 1",
        )


def test_rate_limit(client, salon):
    o, m, s = salon()
    for i in range(10):
        data = payload(m, s)
        data["start_time"] = future(hour=3).isoformat()
        assert client.post(f"/api/public/{o['id']}/bookings", json=data).status_code == 422
    assert client.post(f"/api/public/{o['id']}/bookings", json=payload(m, s)).status_code == 429


def test_block_and_restore_conflict(client, salon):
    o, m, s = salon()
    a, _ = book(client, o, m, s)
    base = f"/api/organizations/{o['id']}"
    assert (
        client.patch(
            base + f"/appointments/{a['id']}/status",
            headers=signed(),
            json={"status": "canceled", "version": 1},
        ).status_code
        == 200
    )
    b = client.post(
        base + "/blocks",
        headers=signed(),
        json={"member_id": m["id"], "start_time": future().isoformat(), "duration_minutes": 60},
    )
    assert b.status_code == 201
    assert (
        client.patch(
            base + f"/appointments/{a['id']}/status",
            headers=signed(),
            json={"status": "pending", "version": 2},
        ).status_code
        == 409
    )


def test_expired_invitation_and_cross_tenant_pet(client, salon):
    o, m, s = salon()
    other, _, _ = salon(303)
    invitation = client.post(
        f"/api/organizations/{o['id']}/invitations", headers=signed(), json={"name": "Новый мастер"}
    ).json()
    with transaction() as c:
        c.execute("UPDATE invitations SET expires_at=now()-interval '1 second'")
    assert (
        client.post(
            "/api/invitations/accept", headers=signed(202), json={"token": invitation["token"]}
        ).status_code
        == 410
    )
    cl = client.post(
        f"/api/organizations/{other['id']}/clients",
        headers=signed(303),
        json={"name": "Другой клиент", "phone": "+77770000000"},
    ).json()
    assert (
        client.post(
            f"/api/organizations/{o['id']}/clients/{cl['id']}/pets",
            headers=signed(),
            json={"name": "Питомец"},
        ).status_code
        == 404
    )
    d = payload(m, s)
    d["client_id"] = cl["id"]
    assert (
        client.post(f"/api/organizations/{o['id']}/appointments", headers=signed(), json=d).status_code == 404
    )


def test_service_snapshot_and_adjacent_slots(client, salon):
    o, m, s = salon()
    a, _ = book(client, o, m, s)
    assert (
        client.put(
            f"/api/organizations/{o['id']}/services/{s['id']}",
            headers=signed(),
            json={
                "title": "Новая цена",
                "price_minor": 900000,
                "duration_minutes": 30,
                "member_ids": [m["id"]],
            },
        ).status_code
        == 200
    )
    # The immediately adjacent interval is valid; old booking retains its snapshot.
    b, _ = book(client, o, m, s, start=future(hour=11), phone="+77770000002")
    with transaction() as c:
        old = one(c, "SELECT * FROM appointments WHERE id=%s", (a["id"],))
        new = one(c, "SELECT * FROM appointments WHERE id=%s", (b["id"],))
        assert old["total_minor"] == 800000 and new["total_minor"] == 900000
        assert (old["end_time"] - old["start_time"]).total_seconds() == 3600
        assert (
            one(c, "SELECT title FROM appointment_items WHERE appointment_id=%s", (a["id"],))["title"]
            == "Стрижка"
        )


def test_subscription_extends_remaining_trial_and_paid_period(client, salon):
    o, m, s = salon()
    with transaction() as c:
        original = one(c, "SELECT trial_ends_at FROM subscriptions WHERE org_id=%s", (o["id"],))[
            "trial_ends_at"
        ]
    for index in range(2):
        r = client.post(
            f"/api/operator/organizations/{o['id']}/renew",
            headers=signed(900),
            json={"amount_minor": 100000, "reference": f"receipt-{index}", "request_key": str(uuid4())},
        )
        assert r.status_code == 200
        assert datetime.fromisoformat(r.json()["paid_until"]) == original + timedelta(days=30 * (index + 1))


def test_admin_permissions(client, salon):
    o, m, s = salon()
    admin, _ = invite(client, o, role="admin")
    base = f"/api/organizations/{o['id']}"
    assert client.get(base + "/export", headers=signed(202)).status_code == 200
    assert client.post(base + "/appointments", headers=signed(202), json=payload(m, s)).status_code == 201
    assert (
        client.post(base + "/invitations", headers=signed(202), json={"name": "Нет доступа"}).status_code
        == 403
    )
    assert client.put(base, headers=signed(202), json={"name": "Другое имя"}).status_code == 403


def test_timezone_and_working_boundaries(client, salon):
    o, m, s = salon()
    assert (
        client.post(f"/api/public/{o['id']}/bookings", json=payload(m, s, future(hour=19))).status_code == 422
    )
    d = payload(m, s)
    d["start_time"] = future().replace(tzinfo=None).isoformat()
    assert client.post(f"/api/public/{o['id']}/bookings", json=d).status_code == 422
    assert (
        client.post(
            f"/api/public/{o['id']}/bookings",
            json=payload(m, s, datetime.now(timezone.utc) - timedelta(days=1)),
        ).status_code
        == 422
    )
    # Company timezone is independent of browser/server timezone.
    assert (
        client.put(
            f"/api/organizations/{o['id']}",
            headers=signed(),
            json={"name": "Москва", "timezone": "Europe/Moscow"},
        ).status_code
        == 200
    )
    moscow = future().replace(tzinfo=ZoneInfo("Europe/Moscow"))
    a, _ = book(client, o, m, s, start=moscow)
    with transaction() as c:
        row = one(c, "SELECT start_time FROM appointments WHERE id=%s", (a["id"],))
        assert row["start_time"].astimezone(timezone.utc).hour == 7


def test_notification_retry_limit_and_bot_unreachable(client, salon):
    o, m, s = salon()
    book(client, o, m, s)
    with transaction() as c:
        c.execute("INSERT INTO bot_users(tg_id) VALUES (101)")
    assert deliver_one(lambda _: {"ok": False, "error_code": 403})
    with transaction() as c:
        assert not one(c, "SELECT reachable FROM bot_users WHERE tg_id=101")["reachable"]
        assert one(c, "SELECT failed_at FROM outbox ORDER BY id LIMIT 1")["failed_at"] is not None


def test_database_foreign_key_isolation(client, salon):
    import psycopg
    import pytest

    o, m, s = salon()
    other, om, os = salon(303)
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        with transaction() as c:
            c.execute("INSERT INTO member_services VALUES (%s,%s,%s)", (o["id"], m["id"], os["id"]))
