# 🏭 Manufacturing Optimizer

Интеллектуальная система оптимизации производства с использованием CPM/PERT и искусственного интеллекта.

## 🚀 Возможности

- 📊 Визуализация производственных процессов (сетевые графики)
- 🧠 AI-оптимизация распределения ресурсов и бригад
- 📈 Расчет критического пути (CPM) и резервов времени
- 👥 Разделение ролей (администратор / рабочий)
- 📁 Импорт/экспорт Excel файлов
- ⚡ Реалтайм обновления через WebSocket

## 🛠 Технологии

### Frontend
- Electron - десктопное приложение
- Cytoscape.js - визуализация графов
- Handsontable - Excel-подобные таблицы
- Anime.js - анимации

### Backend
- FastAPI - REST API
- scikit-learn - машинное обучение
- XGBoost / LightGBM - градиентный бустинг
- NetworkX - работа с графами
- OR-Tools - оптимизация
- SQLite - база данных

## 📦 Установка

### Windows
```powershell
# Установка Python зависимостей
cd python-backend
pip install -r requirements.txt

# Установка Electron зависимостей
cd ../electron-app
npm install

# Запуск
cd ..
.\scripts\start.bat


# Тестовый доступ
Логин: admin
Пароль: admin123