<div align="center">

<img src="EVA/manufacturing-optimizer/electron-app/renderer/assets/icons/app-icon.png" width="96" height="96" alt="Manufacturing Optimizer" onerror="this.style.display='none'">

# 🏭 Manufacturing Optimizer

### Интеллектуальная система оптимизации производства

**CPM/PERT-планирование · AI-прогнозирование срывов · Оптимизация бригад · Explainable AI**

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-2A5294?style=flat-square)](#-установка)
[![Electron](https://img.shields.io/badge/Electron-27.x-47848F?style=flat-square&logo=electron&logoColor=white)](#-технологический-стек)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-009688?style=flat-square&logo=fastapi&logoColor=white)](#-технологический-стек)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](#-технологический-стек)
[![License](https://img.shields.io/badge/license-Proprietary-lightgrey?style=flat-square)](#-лицензия)
[![Version](https://img.shields.io/badge/version-2.0.0-0961f6?style=flat-square)](docs/changelog/CHANGELOG.md)

[Возможности](#-ключевые-возможности) ·
[Архитектура](#-архитектура) ·
[Быстрый старт](#-быстрый-старт) ·
[Роли доступа](#-роли-и-права-доступа) ·
[AI-модули](#-ai--машинное-обучение) ·
[API](#-api) ·
[Документация](#-документация)

</div>

<br>

## 📖 О проекте

**Manufacturing Optimizer** (кодовое название **NEVZ**) — десктопное приложение для планирования и оптимизации производственных процессов, построенное на классическом сетевом планировании (**CPM/PERT**) и усиленное собственным AI-движком: предсказание срывов сроков, обнаружение аномалий, автоматическое «латание» пробелов в графике и обучение на исторических данных.

Приложение работает как связка **Electron-клиента** (три специализированные панели — администратор, бригадир, рабочий) и локального **Python/FastAPI-бэкенда**, который считает критический путь, запускает ML-модели и хранит данные в SQLite.

> 💡 Проект ориентирован на производственные предприятия, где важно одновременно видеть сетевой график, реальную загрузку бригад и получать AI-рекомендации о том, где график «поплывёт» раньше, чем это станет проблемой.

<br>

## ✨ Ключевые возможности

<table>
<tr>
<td width="50%" valign="top">

### 📊 Планирование и расчёты
- Построение сетевого графика на основе **CPM** (критический путь) и **PERT** (вероятностные оценки)
- Расчёт резервов времени (slack), сжатие графика (crashing), выравнивание ресурсов
- Интерактивная **диаграмма Ганта** (frappe-gantt) и сетевые диаграммы (Cytoscape + dagre)
- Импорт/экспорт данных в Excel (`.xlsx/.xls/.xlsb`) и CSV

### 🤖 AI и оптимизация
- Предиктивные модели срыва сроков (Gradient Boosting, XGBoost, LightGBM, CatBoost, ансамбли)
- Детектор аномалий и «охотник за пробелами» (gap detector / bridger) в графике
- Оптимизация бригад: линейное программирование, генетический алгоритм, OR-Tools
- Обучение с подкреплением (RL) для адаптивного планирования
- Explainable AI: **SHAP** и **LIME** для объяснения решений модели

</td>
<td width="50%" valign="top">

### 👥 Ролевая модель
- Три специализированные панели: **Администратор**, **Бригадир**, **Рабочий**
- Вход по логину/паролю **или по QR-коду** со смартфона (см. [ниже](#-вход-по-qr-коду))
- Гибкое управление бригадами, задачами и загрузкой персонала

### ⚙️ Технические особенности
- Локальный REST API на FastAPI, автосвязка Electron ↔ Python при старте
- SQLite как единая база данных (единый адаптер `db_unified.py`)
- Real-time обновления через WebSocket
- Мультиязычный интерфейс (RU / EN, `locales/*.json`)
- Кроссплатформенная сборка: Windows (NSIS), macOS (DMG), Linux (AppImage)

</td>
</tr>
</table>

<br>

## 🏗 Архитектура

Приложение построено по схеме **«толстый клиент + локальный сервис»**: Electron поднимает Python-процесс как дочерний, всё общение идёт по `http://127.0.0.1:8000`.

```mermaid
flowchart TB
    subgraph Electron["🖥 Electron App"]
        direction TB
        Main["main.js\nуправление окнами · IPC · жизненный цикл Python-процесса"]
        Preload["preload.js\nбезопасный мост contextBridge"]
        subgraph Renderer["Renderer (окна по ролям)"]
            Login["index.html\nЛогин / QR"]
            Admin["admin.html\nПанель администратора"]
            Brig["brigadier.html\nПанель бригадира"]
            Worker["worker.html\nПанель рабочего"]
        end
        Main -->|spawn| Python
        Main --> Login & Admin & Brig & Worker
        Preload -.-> Renderer
    end

    subgraph Backend["🐍 Python Backend (FastAPI)"]
        Python["api.py — точка входа"]
        Auth["auth_api.py\nлогин · QR-сессии"]
        CPM["cpm/\nкритический путь · PERT"]
        AI["ai/\nпредикторы · RL · explainability"]
        Opt["optimization/\nOR-Tools · генетич. алгоритмы"]
        DB[("SQLite\nmanufacturing.db")]
        Python --> Auth & CPM & AI & Opt
        Auth --> DB
        CPM --> DB
        AI --> DB
        Opt --> DB
    end

    Renderer <-->|"REST / WebSocket"| Python
    Phone["📱 Телефон\n(вход по QR)"] -->|"HTTP, та же Wi-Fi"| Auth
```

**Ключевая идея роутинга ролей** (`auth_api.py → row_user()`):

```
role == "admin"        →  открывается панель администратора
is_brigadier == 1      →  открывается панель бригадира
иначе                  →  открывается панель рабочего
```

<br>

## 🧰 Технологический стек

| Слой | Технологии |
|---|---|
| **Desktop-оболочка** | Electron 27, IPC + `contextBridge`, `electron-builder` |
| **Frontend / UI** | Vanilla JS, HTML5, CSS3 (кастомные тёмные темы), Anime.js |
| **Визуализация** | Handsontable (таблицы), Frappe Gantt (диаграмма Ганта), Cytoscape + dagre (сетевые графы) |
| **Backend API** | Python 3.10+, FastAPI, Uvicorn, Pydantic, WebSockets |
| **Данные** | SQLite, SQLAlchemy, aiosqlite, Pandas, NumPy, OpenPyXL |
| **Машинное обучение** | scikit-learn, XGBoost, LightGBM, CatBoost, NetworkX |
| **Оптимизация** | Google OR-Tools, генетические алгоритмы, линейное программирование |
| **Explainable AI** | SHAP, LIME |
| **Безопасность** | passlib (bcrypt), python-jose |

<br>

## 📁 Структура проекта

```
NEVZ/
└── EVA/manufacturing-optimizer/
    ├── electron-app/                 # Desktop-клиент
    │   ├── main.js                   # Главный процесс: окна, IPC, запуск Python
    │   ├── preload.js                # contextBridge API для renderer'а
    │   └── renderer/
    │       ├── index.html            # Экран входа (логин / QR)
    │       ├── admin.html            # Панель администратора
    │       ├── brigadier.html        # Панель бригадира
    │       ├── worker.html           # Панель рабочего
    │       ├── css/                  # Стили (по одной теме на экран)
    │       ├── js/{admin,worker,brigadier,shared}/
    │       └── locales/{ru,en}.json  # Локализация
    │
    ├── python-backend/               # Backend-сервис
    │   ├── api.py                    # Точка входа FastAPI
    │   ├── auth_api.py               # Аутентификация, роли, QR-вход
    │   ├── api/                      # REST-роутеры (admin, workers, brigades, reports…)
    │   ├── cpm/                      # Критический путь, PERT, резервы, сжатие графика
    │   ├── ai/                       # Предикторы, RL, explainability, path intelligence
    │   ├── optimization/             # OR-Tools, генетический алгоритм, балансировка
    │   ├── core/                     # Конфигурация, модели БД, схемы
    │   ├── services/                 # Бизнес-логика (бригады, планирование, уведомления)
    │   └── data/                     # manufacturing.db и сопутствующие данные
    │
    └── docs/                         # Архитектура, гайды, схема БД, changelog
```

<br>

## 🚀 Быстрый старт

### Требования

- **Node.js** ≥ 18 и npm
- **Python** ≥ 3.10 и pip
- Windows / macOS / Linux

### Установка

```bash
# 1. Клонировать репозиторий
git clone https://github.com/VinfinityVois/NEVZ.git
cd NEVZ/EVA/manufacturing-optimizer

# 2. Установить зависимости бэкенда
cd python-backend
pip install -r requirements.txt

# 3. Установить зависимости desktop-клиента
cd ../electron-app
npm install
```

### Запуск

```bash
# Backend поднимется автоматически при старте Electron,
# либо его можно запустить отдельно для отладки:
cd python-backend && python api.py
#   → API:  http://127.0.0.1:8000
#   → Docs: http://127.0.0.1:8000/docs

# Desktop-приложение:
cd electron-app
npm start
```

### Сборка дистрибутива

```bash
cd electron-app
npm run build     # electron-builder → dist/ (NSIS / DMG / AppImage)
```

<br>

## 👤 Роли и права доступа

| Роль | Как попадает | Возможности |
|---|---|---|
| 🛡 **Администратор** | `role = "admin"` в БД | Полное управление: сотрудники, бригады, операции, отчёты, обучение AI-моделей |
| 👷‍♂️ **Бригадир** | `is_brigadier = 1` | Управление своей бригадой, распределение задач, контроль хода работ |
| 🧑‍🔧 **Рабочий** | по умолчанию | Просмотр своих задач, отметки о выполнении, статус |

<br>

## 📲 Вход по QR-коду

Экран входа поддерживает второй способ авторизации — сканирование QR-кода телефоном:

1. На компьютере генерируется одноразовая сессия (`POST /auth/qr/create`), QR кодирует ссылку вида `http://<IP-компьютера>:8000/auth/qr/page/<token>`.
2. Телефон (в той же локальной сети) сканирует код и открывает мобильную страницу входа.
3. После ввода логина/пароля на телефоне (`POST /auth/qr/confirm`) сессия подтверждается.
4. Окно входа на компьютере, опрашивающее `GET /auth/qr/poll`, автоматически авторизуется и открывает нужную панель.

QR-сессия действует ограниченное время и одноразовая — после подтверждения токен становится недействителен.

<br>

## 🧠 AI / машинное обучение

Модуль `python-backend/ai/` — сердце «интеллектуальной» части системы:

| Подмодуль | Назначение |
|---|---|
| `predictor.py`, `models/` | Предсказание срыва сроков (регрессия, градиентный бустинг, нейросеть, ансамбли) |
| `anomaly_detector.py` | Обнаружение аномалий в ходе выполнения операций |
| `path_intelligence/` | Поиск и оценка альтернативных путей в графике, анализ разрывов Ганта |
| `gap_detector.py`, `gap_bridger.py` | Поиск и автоматическое «латание» пробелов в расписании |
| `reinforcement/` | RL-агент, среда и политика для адаптивного перепланирования |
| `explainability/` | SHAP / LIME / feature importance — объяснение решений модели |
| `learning/`, `training/` | Сбор данных, валидация, кросс-валидация, дообучение моделей на реальных данных |
| `scenario_simulator.py`, `plan_compare.py` | Сценарное моделирование и сравнение планов |

<br>

## 🔌 API

Backend экспонирует REST + WebSocket API, сгруппированный по доменам (`python-backend/api/`):

| Роутер | Отвечает за |
|---|---|
| `auth.py`, `auth_api.py` | Логин, сессии, QR-вход, роли |
| `admin.py` | Администрирование системы |
| `workers.py` | Сотрудники |
| `brigades.py` | Бригады и их состав |
| `operations.py` | Производственные операции |
| `cpm_endpoints.py` | Расчёт критического пути / PERT |
| `optimization_endpoints.py` | Запуск оптимизаторов |
| `ai_endpoints.py` | Инференс и статус AI-моделей |
| `import_export.py` | Импорт/экспорт Excel и CSV |
| `reports.py` | Отчётность |
| `websocket.py` | Real-time обновления |

Полная интерактивная документация доступна локально после запуска сервера: **`http://127.0.0.1:8000/docs`**.

<br>

## 🗄 База данных

Единая SQLite-база (`data/manufacturing.db`), ключевые таблицы:

`workers` · `brigades` · `brigade_groups` · `brigade_group_members` · `brigade_tasks` · `brigade_schedule` · `operations` · `operation_history` · `ai_training_data`

Подробная схема — в [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md).

<br>

## 📚 Документация

| Документ | Содержание |
|---|---|
| [`docs/INSTALLATION.md`](docs/INSTALLATION.md) | Подробная установка и настройка окружения |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | Руководство пользователя |
| [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md) | Руководство администратора |
| [`docs/AI_MODELS.md`](docs/AI_MODELS.md) | Описание AI-моделей и их обучения |
| [`docs/API_DOCS.md`](docs/API_DOCS.md) | Справочник по API |
| [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | Схема базы данных |
| [`docs/architecture/`](docs/architecture) | Системная архитектура, диаграммы компонентов, потоки данных |
| [`docs/changelog/CHANGELOG.md`](docs/changelog/CHANGELOG.md) | История изменений |

<br>

## 🗺 Дорожная карта

- [ ] Расширение мобильного QR-флоу до полноценного мобильного клиента
- [ ] Онлайн-переобучение моделей на потоке новых данных
- [ ] Экспорт отчётов в PDF/PowerPoint
- [ ] Тёмная/светлая тема на выбор пользователя

<br>

## 🤝 Вклад в проект

Issue и Pull Request приветствуются. Перед крупными изменениями — заведите issue с описанием предлагаемого решения.

## 📄 Лицензия

Проект распространяется на условиях, указанных в файле `LICENSE` (см. корень репозитория). Для коммерческого использования — свяжитесь с командой разработки.

<br>

<div align="center">

Сделано командой **Manufacturing Optimizer Team**

</div>
