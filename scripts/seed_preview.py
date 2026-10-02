"""Local UI verification only; uses the isolated test token, never a production auth bypass."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend/tests"))
from conftest import signed
import httpx

if __name__ == "__main__":
    with httpx.Client(base_url="http://127.0.0.1:8000") as c:
        me = c.get("/api/me", headers=signed()).json()
        if not me.get("organizations"):
            result = c.post(
                "/api/organizations",
                headers=signed(),
                json={
                    "name": "Лапки и хвостики",
                    "address": "Алматы, улица Абая, 25",
                    "phone": "+7 777 123 45 67",
                },
            )
            result.raise_for_status()
        org = c.get("/api/me", headers=signed()).json()["organizations"][0]
        members = c.get(
            f"/api/organizations/{org['id']}/members", headers=signed()
        ).json()
        if not c.get(
            f"/api/organizations/{org['id']}/services", headers=signed()
        ).json():
            for title, price, duration in [
                ("Комплексный уход", 800000, 90),
                ("Гигиеническая стрижка", 400000, 60),
                ("Подстригание когтей", 150000, 30),
            ]:
                c.post(
                    f"/api/organizations/{org['id']}/services",
                    headers=signed(),
                    json={
                        "title": title,
                        "price_minor": price,
                        "duration_minutes": duration,
                        "member_ids": [members[0]["id"]],
                    },
                ).raise_for_status()
        raw = signed()["X-Telegram-Init-Data"]
        script = (
            'Object.defineProperty(window,"Telegram",{configurable:true,get:()=>({WebApp:{initData:'
            + json.dumps(raw)
            + ",initDataUnsafe:{},ready(){},expand(){}}}),set(){}});"
        )
        Path("/private/tmp/grooming-preview-init.js").write_text(script)
        Path("/private/tmp/grooming-preview-org.txt").write_text(org["id"])
        print("Preview organization:", org["id"])
