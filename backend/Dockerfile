# backend/Dockerfile

# Используем Python 3.12
FROM python:3.12-slim

# Рабочая папка
WORKDIR /app

# Копируем зависимости
COPY requirements.txt .

# Устанавливаем их
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код приложения
COPY . .

# Запускаем сервер
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]