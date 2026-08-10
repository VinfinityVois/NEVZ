# Используем официальный образ Python
FROM python:3.11-slim

# Устанавливаем системные зависимости (для pandas/numpy/openpyxl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Рабочая директория внутри контейнера
WORKDIR /app

# Копируем зависимости отдельно (для кэширования слоёв)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь код проекта
COPY . .

# Создаём папки для данных (SQLite создаст БД здесь при первом запуске)
RUN mkdir -p /app/data/exports

# Открываем порт
EXPOSE 8000

# Запускаем сервер
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]