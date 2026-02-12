# (c) 2026 Владимир Коваленко. Все права защищены.
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.auth import validate_telegram_data
from app.routers import admin, client, analytics

app = FastAPI(title="Grooming TMA API")

# Настройка CORS - ОБЯЗАТЕЛЬНО добавили порт 5173
ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8000",
    "http://localhost:5173",  # Твой локальный React
    "https://grooming-tma-frontend.onrender.com",
    "https://web.telegram.org",
    "https://a.web.telegram.org",
    "https://k.web.telegram.org",
    "https://macos.telegram.org"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Подключаем роутеры с ПРЕФИКСАМИ. Теперь /client/masters/ будет работать.
app.include_router(admin.router, prefix="/admin")
app.include_router(client.router, prefix="/client")
app.include_router(analytics.router, prefix="/analytics")

@app.get("/health")
async def health_check():
    return {"status": "ok"}