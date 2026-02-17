#!/usr/bin/env bash
# Exit on error
set -o errexit

# 1. Сборка Frontend
echo "Building Frontend..."
cd frontend
npm install
npm run build
cd ..

# 2. Установка зависимостей Backend
echo "Installing Backend dependencies..."
pip install -r backend/requirements.txt