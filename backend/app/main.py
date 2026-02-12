# (c) 2026 Владимир Коваленко. Все права защищены.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import admin, client, analytics

app = FastAPI(title="Grooming TMA API")

# Настройка CORS - разрешаем твой локальный React и Render
ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8000",
    "http://localhost:5173",
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

# Подключаем роутеры с префиксами. Теперь /client/masters/ будет работать!
app.include_router(admin.router, prefix="/admin")
app.include_router(client.router, prefix="/client")
app.include_router(analytics.router, prefix="/analytics")

@app.get("/health")
async def health_check():
    return {"status": "ok"}