from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

app = FastAPI(title="Grooming App API")

# 1. Подключаем API роуты
# app.include_router(appointments.router, prefix="/api/v1")

# 2. Настраиваем статику (Frontend)
# Проверяем, существует ли папка (чтобы локально не падало)
if os.path.exists("../frontend/dist"):
    app.mount("/assets", StaticFiles(directory="../frontend/dist/assets"), name="assets")


# 3. SPA Catch-all (Любой путь возвращает index.html, роутинг делает React)
@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    # Если запрос к API - ничего не отдаем (пусть обрабатывает роутер выше)
    if full_path.startswith("api"):
        return {"error": "Not found"}

    # Иначе отдаем index.html
    if os.path.exists("../frontend/dist/index.html"):
        return FileResponse("../frontend/dist/index.html")
    return {"message": "Frontend not built. Run npm run build"}