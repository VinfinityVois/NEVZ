<div align="center">

<img src="EVA/manufacturing-optimizer/electron-app/renderer/assets/icons/app-icon.svg" width="88" height="88" alt="Manufacturing Optimizer logo"/>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0961f6,100:66CEF6&height=200&section=header&text=Manufacturing%20Optimizer&fontSize=44&fontColor=ffffff&fontAlignY=40&desc=%D0%98%D0%BD%D1%82%D0%B5%D0%BB%D0%BB%D0%B5%D0%BA%D1%82%D1%83%D0%B0%D0%BB%D1%8C%D0%BD%D0%B0%D1%8F%20%D0%BE%D0%BF%D1%82%D0%B8%D0%BC%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F%20%D0%BF%D1%80%D0%BE%D0%B8%D0%B7%D0%B2%D0%BE%D0%B4%D1%81%D1%82%D0%B2%D0%B0&descAlignY=60&descSize=18&animation=fadeIn" width="100%" alt="Manufacturing Optimizer banner"/>

<a href="https://github.com/VinfinityVois/NEVZ">
  <img src="https://readme-typing-svg.demolab.com/?font=Fira+Code&weight=600&size=18&duration=3200&pause=900&color=66CEF6&center=true&vCenter=true&width=720&lines=CPM%2FPERT%20%D1%81%D0%B5%D1%82%D0%B5%D0%B2%D0%BE%D0%B5%20%D0%BF%D0%BB%D0%B0%D0%BD%D0%B8%D1%80%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D0%B5;AI-%D0%BF%D1%80%D0%BE%D0%B3%D0%BD%D0%BE%D0%B7%20%D1%81%D1%80%D1%8B%D0%B2%D0%BE%D0%B2%20%D1%81%D1%80%D0%BE%D0%BA%D0%BE%D0%B2;%D0%9E%D0%BF%D1%82%D0%B8%D0%BC%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F%20%D0%B1%D1%80%D0%B8%D0%B3%D0%B0%D0%B4%20%D0%B2%20%D1%80%D0%B5%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%BC%20%D0%B2%D1%80%D0%B5%D0%BC%D0%B5%D0%BD%D0%B8;Explainable%20AI%20%E2%80%94%20SHAP%20%D0%B8%20LIME" alt="Typing SVG"/>
</a>

<br>

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-2A5294?style=for-the-badge)](#-установка)
[![Electron](https://img.shields.io/badge/Electron-27.x-47848F?style=for-the-badge&logo=electron&logoColor=white)](#-технологический-стек)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](#-технологический-стек)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](#-технологический-стек)
[![Version](https://img.shields.io/badge/version-2.1.0-0961f6?style=for-the-badge)](docs/changelog/CHANGELOG.md)

![Last commit](https://img.shields.io/github/last-commit/VinfinityVois/NEVZ?style=flat-square&color=66CEF6&label=последний%20коммит)
![Repo size](https://img.shields.io/github/repo-size/VinfinityVois/NEVZ?style=flat-square&color=0961f6&label=размер%20репозитория)
![Top language](https://img.shields.io/github/languages/top/VinfinityVois/NEVZ?style=flat-square&color=2A5294&label=основной%20язык)

<br>

<img src="https://skillicons.dev/icons?i=electron,html,css,javascript,nodejs,python,fastapi,sqlite&theme=dark" alt="tech stack icons"/>

<br><br>

**[📸 Скриншоты](#-скриншоты)** &nbsp;•&nbsp;
**[✨ Возможности](#-ключевые-возможности)** &nbsp;•&nbsp;
**[🏗 Архитектура](#-архитектура)** &nbsp;•&nbsp;
**[🚀 Быстрый старт](#-быстрый-старт)** &nbsp;•&nbsp;
**[⚙️ Конфигурация](#️-конфигурация)** &nbsp;•&nbsp;
**[👤 Роли](#-роли-и-права-доступа)** &nbsp;•&nbsp;
**[🏭 Операции](#-поддерживаемые-типы-производственных-операций)** &nbsp;•&nbsp;
**[🧠 AI](#-ai--машинное-обучение)** &nbsp;•&nbsp;
**[🔌 API](#-api)** &nbsp;•&nbsp;
**[🗄 БД](#-база-данных)** &nbsp;•&nbsp;
**[🧪 Тесты](#-тестирование)** &nbsp;•&nbsp;
**[🔒 Безопасность](#-безопасность)** &nbsp;•&nbsp;
**[❓ FAQ](#-faq--известные-особенности)**

</div>

<br>

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/factory-gear.svg" width="26" valign="middle"/> О проекте

**Manufacturing Optimizer** (кодовое название **NEVZ**) — десктопное приложение для планирования и оптимизации производственных процессов, построенное на классическом сетевом планировании (**CPM/PERT**) и усиленное собственным AI-движком: предсказание срывов сроков, обнаружение аномалий, автоматическое «латание» пробелов в графике и обучение на исторических данных.

Приложение работает как связка **Electron-клиента** (три специализированные панели — администратор, бригадир, рабочий) и локального **Python/FastAPI-бэкенда**, который считает критический путь, запускает ML-модели и хранит данные в SQLite.

> 💡 Проект ориентирован на производственные предприятия, где важно одновременно видеть сетевой график, реальную загрузку бригад и получать AI-рекомендации о том, где график «поплывёт» раньше, чем это станет проблемой.

<br>

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/dashboard.svg" width="26" valign="middle"/> Скриншоты

<div align="center">
<table>
<tr>
<td width="50%" align="center">
<img src="EVA/manufacturing-optimizer/docs/assets/screenshots/login-screen.png" width="100%" alt="Экран входа"/>
<br><sub><b>Экран входа</b> — логин/пароль или QR-код со смартфона</sub>
</td>
<td width="50%" align="center">
<img src="EVA/manufacturing-optimizer/docs/assets/screenshots/brigadier-assignments.png" width="100%" alt="Панель бригадира — Назначения"/>
<br><sub><b>Панель бригадира</b> — перенос сотрудников и назначение работ бригаде</sub>
</td>
</tr>
</table>
</div>

<br>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rect&color=0:0b1c33,50:0961f6,100:0b1c33&height=3&width=1000" width="100%"/>
</div>

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/ai-layers.svg" width="26" valign="middle"/> Ключевые возможности

<table>
<tr>
<td width="50%" valign="top">

### <img src="EVA/manufacturing-optimizer/docs/assets/icons/analytics.svg" width="20" valign="middle"/> Планирование и расчёты
- Построение сетевого графика на основе **CPM** (критический путь) и **PERT** (вероятностные оценки)
- Расчёт резервов времени (slack), сжатие графика (crashing), выравнивание ресурсов
- Интерактивная **диаграмма Ганта** (frappe-gantt) и сетевые диаграммы (Cytoscape + dagre)
- Импорт/экспорт данных в Excel (`.xlsx/.xls/.xlsb`) и CSV

### <img src="EVA/manufacturing-optimizer/docs/assets/icons/ai-layers.svg" width="20" valign="middle"/> AI и оптимизация
- Предиктивные модели срыва сроков (Gradient Boosting, XGBoost, LightGBM, CatBoost, ансамбли)
- Детектор аномалий и «охотник за пробелами» (gap detector / bridger) в графике
- Оптимизация бригад: линейное программирование, генетический алгоритм, OR-Tools
- Обучение с подкреплением (RL) для адаптивного планирования
- Explainable AI: **SHAP** и **LIME** для объяснения решений модели

</td>
<td width="50%" valign="top">

### <img src="EVA/manufacturing-optimizer/docs/assets/icons/brigade.svg" width="20" valign="middle"/> Ролевая модель
- Три специализированные панели: **Администратор**, **Бригадир**, **Рабочий**
- Вход по логину/паролю **или по QR-коду** со смартфона (см. [ниже](#-вход-по-qr-коду))
- Гибкое управление бригадами, задачами и загрузкой персонала

### <img src="EVA/manufacturing-optimizer/docs/assets/icons/dashboard.svg" width="20" valign="middle"/> Технические особенности
- Локальный REST API на FastAPI, автосвязка Electron ↔ Python при старте
- SQLite как единая база данных
- Real-time обновления через WebSocket
- Мультиязычный интерфейс (RU / EN, `locales/*.json`)
- Кроссплатформенная сборка: Windows (NSIS), macOS (DMG), Linux (AppImage)

</td>
</tr>
</table>

<br>

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/process-node.svg" width="26" valign="middle"/> Архитектура

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

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/terminal.svg" width="26" valign="middle"/> Технологический стек

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

<details>
<summary><b>Развернуть дерево каталогов</b> 📂</summary>

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
    │       ├── assets/icons/         # Логотип приложения (app-icon.svg)
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
        └── assets/icons/             # Набор SVG-иконок для документации
```

</details>

<br>

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/terminal.svg" width="26" valign="middle"/> Быстрый старт

### Требования

![Node](https://img.shields.io/badge/Node.js-≥18-339933?style=flat-square&logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/Python-≥3.10-3776AB?style=flat-square&logo=python&logoColor=white)
![OS](https://img.shields.io/badge/OS-Windows%20%7C%20macOS%20%7C%20Linux-2A5294?style=flat-square)

<details open>
<summary><b>1️⃣ Установка зависимостей</b></summary>

```bash
# Клонировать репозиторий
git clone https://github.com/VinfinityVois/NEVZ.git
cd NEVZ/EVA/manufacturing-optimizer

# Зависимости бэкенда
cd python-backend
pip install -r requirements.txt

# Зависимости desktop-клиента
cd ../electron-app
npm install
```

</details>

<details>
<summary><b>2️⃣ Запуск</b></summary>

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

</details>

<details>
<summary><b>3️⃣ Сборка дистрибутива</b></summary>

```bash
cd electron-app
npm run build     # electron-builder → dist/ (NSIS / DMG / AppImage)
```

</details>

<br>

## ⚙️ Конфигурация

Настройки читаются из `python-backend/.env` (шаблон — [`.env.example`](EVA/manufacturing-optimizer/python-backend/.env.example)):

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `API_HOST` | `127.0.0.1` | Адрес, на котором поднимается FastAPI |
| `API_PORT` | `8000` | Порт backend'а (используется и для QR-ссылок) |
| `DEBUG` | `true` | Режим отладки FastAPI |
| `DATA_DIR` | `../data` | Каталог с `manufacturing.db` |
| `MODELS_DIR` | `./models_storage` | Каталог сохранённых AI-моделей |
| `LOGS_DIR` | `./logs` | Логи backend'а |
| `MODEL_TYPE` | `gradient_boosting` | Тип модели предсказания срывов |
| `DEFAULT_EFFICIENCY_THRESHOLD` | `0.75` | Порог эффективности бригады |
| `MAX_WORKERS_PER_BRIGADE` | `11` | Лимит численности бригады |

```bash
cp python-backend/.env.example python-backend/.env
# при необходимости отредактируйте значения
```

<br>

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/user-profile.svg" width="26" valign="middle"/> Роли и права доступа

| Роль | Как попадает | Возможности |
|---|---|---|
| 🛡 **Администратор** | `role = "admin"` в БД | Полное управление: сотрудники, бригады, операции, отчёты, обучение AI-моделей |
| <img src="EVA/manufacturing-optimizer/docs/assets/icons/brigade.svg" width="16" valign="middle"/> **Бригадир** | `is_brigadier = 1` | Управление своей бригадой, распределение задач, контроль хода работ |
| 🧑‍🔧 **Рабочий** | по умолчанию | Просмотр своих задач, отметки о выполнении, статус |

<br>

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/factory-gear.svg" width="26" valign="middle"/> Поддерживаемые типы производственных операций

<div align="center">

<table>
<tr>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/assembly.svg" width="36"/><br><sub><b>Сборка</b></sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/welding.svg" width="36"/><br><sub><b>Сварка</b></sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/cnc.svg" width="36"/><br><sub><b>ЧПУ / токарные</b></sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/quality-control.svg" width="36"/><br><sub><b>Контроль качества</b></sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/warehouse.svg" width="36"/><br><sub><b>Склад</b></sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/painting.svg" width="36"/><br><sub><b>Покраска</b></sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/electronics.svg" width="36"/><br><sub><b>Электромонтаж</b></sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/logistics.svg" width="36"/><br><sub><b>Логистика</b></sub></td>
</tr>
</table>

</div>

Каждый тип операции привязывается к бригаде (`brigades.description`) и участвует в общем расчёте критического пути — узкое место на любом из участков сразу видно на сетевом графике.

<br>

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/dashboard.svg" width="26" valign="middle"/> Интерфейс

Панели администратора и бригадира построены вокруг набора привычных UI-паттернов:

<div align="center">

<table>
<tr>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/search.svg" width="30"/><br><sub>Поиск</sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/filter.svg" width="30"/><br><sub>Фильтры</sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/calendar.svg" width="30"/><br><sub>Календарь</sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/notifications.svg" width="30"/><br><sub>Уведомления</sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/user-profile.svg" width="30"/><br><sub>Профиль</sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/pdf-export.svg" width="30"/><br><sub>Экспорт в PDF</sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/excel-export.svg" width="30"/><br><sub>Экспорт в Excel</sub></td>
<td align="center" width="12.5%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/logout.svg" width="30"/><br><sub>Выход</sub></td>
</tr>
</table>

</div>

<br>

## 🎨 Библиотека иконок

Все иконки документации и часть иконок интерфейса — собственный набор SVG (`docs/assets/icons/`), в едином фирменном синем `#0961f6`:

<div align="center">
<table>
<tr>
<td align="center" width="9%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/factory-gear.svg" width="26"/></td>
<td align="center" width="9%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/operations.svg" width="26"/></td>
<td align="center" width="9%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/brigade.svg" width="26"/></td>
<td align="center" width="9%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/terminal.svg" width="26"/></td>
<td align="center" width="9%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/analytics.svg" width="26"/></td>
<td align="center" width="9%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/process-node.svg" width="26"/></td>
<td align="center" width="9%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/dashboard.svg" width="26"/></td>
<td align="center" width="9%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/ai-layers.svg" width="26"/></td>
<td align="center" width="9%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/time.svg" width="26"/></td>
<td align="center" width="9%"><img src="EVA/manufacturing-optimizer/docs/assets/icons/alert.svg" width="26"/></td>
</tr>
<tr>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/assembly.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/welding.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/cnc.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/quality-control.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/warehouse.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/painting.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/electronics.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/logistics.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/user-profile.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/search.svg" width="26"/></td>
</tr>
<tr>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/help.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/notifications.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/logout.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/filter.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/calendar.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/pdf-export.svg" width="26"/></td>
<td align="center"><img src="EVA/manufacturing-optimizer/docs/assets/icons/excel-export.svg" width="26"/></td>
<td></td><td></td><td></td>
</tr>
</table>
</div>

<br>

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/user-profile.svg" width="26" valign="middle"/> Вход по QR-коду

Экран входа поддерживает второй способ авторизации — сканирование QR-кода телефоном:

```mermaid
sequenceDiagram
    participant ПК as 🖥 Экран входа (ПК)
    participant API as 🐍 FastAPI
    participant Тел as 📱 Телефон

    ПК->>API: POST /auth/qr/create
    API-->>ПК: token + payload-ссылка (QR)
    ПК->>API: GET /auth/qr/poll (опрос)
    Тел->>API: сканирует QR → GET /auth/qr/page/{token}
    Тел->>API: POST /auth/qr/confirm (логин/пароль)
    API-->>ПК: сессия подтверждена
    ПК->>ПК: открывается нужная панель
```

QR-сессия действует ограниченное время и одноразовая — после подтверждения токен становится недействителен.

<br>

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/ai-layers.svg" width="26" valign="middle"/> AI / машинное обучение

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

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/terminal.svg" width="26" valign="middle"/> API

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

```mermaid
erDiagram
    BRIGADES ||--o{ WORKERS : "включает"
    BRIGADES ||--o{ BRIGADE_TASKS : "выполняет"
    BRIGADES ||--o{ BRIGADE_SCHEDULE : "имеет"
    BRIGADES }o--o{ BRIGADE_GROUPS : "группируется через"
    BRIGADE_GROUPS ||--o{ BRIGADE_GROUP_MEMBERS : "состоит из"
    OPERATIONS ||--o{ BRIGADE_TASKS : "назначается как"
    OPERATIONS ||--o{ OPERATION_HISTORY : "логируется в"
    WORKERS ||--o{ OPERATION_HISTORY : "выполняет"

    WORKERS {
        int id PK
        string name
        string login
        string role
        int is_brigadier
        int brigade_id FK
        string status
    }
    BRIGADES {
        int id PK
        string name
        string description
    }
    OPERATIONS {
        int id PK
        string name
        int duration
        string status
    }
    BRIGADE_TASKS {
        int id PK
        int brigade_id FK
        int operation_id FK
        string status
    }
```

Подробная схема — в [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md).

<br>

## 🧪 Тестирование

Backend покрыт тестами на `pytest` (`python-backend/tests/`):

| Файл | Что проверяет |
|---|---|
| `test_cpm.py` | Расчёт критического пути и PERT |
| `test_ai.py` | Предиктивные AI-модели |
| `test_optimization.py` | Оптимизацию бригад (OR-Tools, генетический алгоритм) |
| `test_api.py` | REST-эндпоинты FastAPI |
| `test_database.py` | Слой доступа к SQLite |
| `test_daily_load.py` | Расчёт дневной загрузки бригад |

```bash
cd python-backend
pytest tests/ -v
```

<br>

## 🔒 Безопасность

- Пароли сотрудников хешируются через **passlib (bcrypt)** — в открытом виде в БД не хранятся
- Вход по QR — **одноразовый токен** с ограниченным временем жизни (`/auth/qr/create` → `/auth/qr/confirm`); после подтверждения токен инвалидируется
- QR-ссылка ведёт на **локальный адрес в LAN**, а не в интернет — вход по QR принципиально невозможен вне локальной сети
- По умолчанию backend слушает только `127.0.0.1` (см. [конфигурацию](#️-конфигурация)) — наружу не торчит без явной настройки
- Роль пользователя определяется исключительно на backend'е (`row_user()`), а не клиентом — renderer не может «повысить» себе права

<br>

## <img src="EVA/manufacturing-optimizer/docs/assets/icons/alert.svg" width="26" valign="middle"/> FAQ / известные особенности

<details>
<summary><b>Я вхожу как обычный сотрудник, но открывается панель бригадира — это баг?</b></summary>
<br>

Не совсем. Роль вычисляется **только** по полю `is_brigadier` в таблице `workers` (см. [логику роутинга](#-архитектура) выше), а не по тому, как пользователь сам себя воспринимает. Если конкретный логин помечен в БД как `is_brigadier = 1` — это и есть бригадир своей бригады, и панель открывается ожидаемо. Если это ошибка в данных — поле можно сбросить напрямую в БД (`UPDATE workers SET is_brigadier = 0 WHERE id = ...`).

</details>

<details>
<summary><b>На панели бригадира какие-то разделы пустые, хотя данные в БД есть</b></summary>
<br>

Проверьте, что запущен только **один** процесс backend'а на порту 8000 — если параллельно висит старый процесс (например, после падения Electron), renderer может достучаться до "зависшего" инстанса со старой in-memory сессией. Помогает: завершить процесс на порту 8000 (`taskkill`/`kill`) и перезапустить приложение. Также стоит убедиться, что локальная копия синхронизирована с `git pull origin main` — расхождение версий фронтенда и бэкенда даёт похожие симптомы.

</details>

<details>
<summary><b>Работает ли вход по QR, если телефон в мобильном интернете (не Wi-Fi)?</b></summary>
<br>

Нет — QR кодирует локальный адрес компьютера (`http://<LAN-IP>:8000/...`), поэтому телефон должен быть в **той же локальной сети**, что и компьютер с запущенным backend'ом.

</details>

<br>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rect&color=0:0b1c33,50:0961f6,100:0b1c33&height=3&width=1000" width="100%"/>
</div>

## 🗺 Дорожная карта

| Задача | Статус |
|---|---|
| Полноценный мобильный клиент для QR-входа | ![planned](https://img.shields.io/badge/-запланировано-lightgrey?style=flat-square) |
| Онлайн-переобучение AI-моделей на потоке новых данных | ![planned](https://img.shields.io/badge/-запланировано-lightgrey?style=flat-square) |
| Экспорт отчётов в PDF/PowerPoint | ![planned](https://img.shields.io/badge/-запланировано-lightgrey?style=flat-square) |
| Тёмная/светлая тема на выбор пользователя | ![in progress](https://img.shields.io/badge/-в%20работе-0961f6?style=flat-square) |

<br>

## ⭐ История звёзд

<div align="center">
<a href="https://star-history.com/#VinfinityVois/NEVZ&Date">
  <img src="https://api.star-history.com/svg?repos=VinfinityVois/NEVZ&type=Date" width="80%" alt="Star History Chart"/>
</a>
</div>

<br>

## 🤝 Вклад в проект

Issue и Pull Request приветствуются. Перед крупными изменениями — заведите issue с описанием предлагаемого решения.

## 📄 Лицензия

Проект распространяется на условиях, указанных в файле `LICENSE` (см. корень репозитория). Для коммерческого использования — свяжитесь с командой разработки.

<br>

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0961f6,100:66CEF6&height=120&section=footer" width="100%"/>

<img src="EVA/manufacturing-optimizer/electron-app/renderer/assets/icons/app-icon.svg" width="32" height="32" alt="logo" valign="middle"/> Сделано командой **Manufacturing Optimizer Team**

</div>
