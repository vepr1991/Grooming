import hashlib
import hmac
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient

import config
from db import transaction
from main import app
from migrate import migrate

TOKEN = "123456:test-only-token-not-a-real-bot"


def signed(uid=101, age=0):
    data = {
        "auth_date": str(int(time.time()) - age),
        "user": json.dumps({"id": uid, "first_name": f"User {uid}"}, ensure_ascii=False),
    }
    secret = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
    data["hash"] = hmac.new(
        secret, "\n".join(f"{k}={v}" for k, v in sorted(data.items())).encode(), hashlib.sha256
    ).hexdigest()
    return {"X-Telegram-Init-Data": urlencode(data)}


@pytest.fixture(scope="session", autouse=True)
def database():
    url = os.getenv("TEST_DATABASE_URL", "")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to an isolated PostgreSQL database ending in _test")
    from psycopg.conninfo import conninfo_to_dict

    if not conninfo_to_dict(url).get("dbname", "").endswith("_test"):
        raise RuntimeError("Refusing to reset a database whose name does not end in _test")
    config.DATABASE_URL = url
    config.TELEGRAM_BOT_TOKEN = TOKEN
    config.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret"
    config.TELEGRAM_BOT_USERNAME = "test_crm_bot"
    config.OPERATOR_IDS = {900}
    migrate()


@pytest.fixture(autouse=True)
def clean_db(database):
    with transaction() as c:
        c.execute(
            "TRUNCATE crm.organizations,crm.bot_users,crm.telegram_updates,crm.rate_limits,crm.outbox RESTART IDENTITY CASCADE"
        )


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture
def salon(client):
    def create(uid=101):
        r = client.post("/api/organizations", headers=signed(uid), json={"name": f"Salon {uid}"})
        assert r.status_code == 201, r.text
        org = r.json()
        member = client.get(f"/api/organizations/{org['id']}/members", headers=signed(uid)).json()[0]
        s = client.post(
            f"/api/organizations/{org['id']}/services",
            headers=signed(uid),
            json={
                "title": "Стрижка",
                "price_minor": 800000,
                "duration_minutes": 60,
                "member_ids": [member["id"]],
            },
        )
        assert s.status_code == 201, s.text
        return org, member, s.json()

    return create
