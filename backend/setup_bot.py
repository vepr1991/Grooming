"""Explicit deployment step; never changes Telegram settings on API startup/shutdown."""

import os

import httpx

import config

if __name__ == "__main__":
    backend = os.getenv("BACKEND_URL", "").rstrip("/")
    if not all(
        [
            backend.startswith("https://"),
            config.APP_URL.startswith("https://"),
            config.TELEGRAM_BOT_TOKEN,
            config.TELEGRAM_WEBHOOK_SECRET,
        ]
    ):
        raise SystemExit(
            "Configure HTTPS APP_URL/BACKEND_URL, TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET"
        )
    with httpx.Client(timeout=20) as client:
        for method, payload in [
            (
                "setWebhook",
                {
                    "url": backend + "/api/webhook",
                    "secret_token": config.TELEGRAM_WEBHOOK_SECRET,
                    "allowed_updates": ["message", "callback_query"],
                },
            ),
            (
                "setChatMenuButton",
                {
                    "menu_button": {
                        "type": "web_app",
                        "text": "Открыть CRM",
                        "web_app": {"url": config.APP_URL},
                    }
                },
            ),
        ]:
            try:
                data = client.post(
                    f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/{method}", json=payload
                ).json()
                if not data.get("ok"):
                    raise ValueError()
                print(f"{method}: OK")
            except (httpx.HTTPError, ValueError):
                raise SystemExit(f"{method} failed. Check credentials and HTTPS URLs.") from None
