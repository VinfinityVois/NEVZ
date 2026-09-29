# Сборка MfgOptimizer → Setup.exe (Windows)

Всё через **терминал VS Code / Void** (PowerShell).

## 0. Что должно быть установлено на ПК сборки

| ПО | Версия | Проверка |
|----|--------|----------|
| Python | **3.11 или 3.12** x64 (не 3.14) | `python --version` |
| Node.js | 18 или 20 LTS | `node --version` |
| Git | любой | `git --version` |
| Место на диске | **≥ 15 GB** свободно | полный ML-бандл |

Установка Python: галочка **Add to PATH**.

---

## 1. Клон / путь к проекту

```powershell
cd C:\MYDESK\code\NEVZ\EVA\manufacturing-optimizer
# или ваш путь к manufacturing-optimizer
```

## 2. Применить этот KIT (файлы сборки)

Распакуйте ZIP `NEVZ_EXE_BUILD_KIT.zip` куда угодно, например `C:\Temp\NEVZ_EXE_BUILD_KIT`.

```powershell
cd C:\Temp\NEVZ_EXE_BUILD_KIT
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\0_apply_kit_to_project.ps1 -ProjectRoot "C:\MYDESK\code\NEVZ\EVA\manufacturing-optimizer"
```

**Что копируется и зачем:**

| Файл | Куда | Зачем |
|------|------|--------|
| `electron-app/main.js` | то же | В packaged-режиме запускает `nevz-api.exe`, БД в AppData |
| `electron-app/electron-builder.json` | то же | NSIS + extraResources (api + db) |
| `electron-app/package.json` | то же | scripts `dist` / `build` |
| `python-backend/run_api.py` | то же | Точка входа PyInstaller |
| `python-backend/nevz-api.spec` | то же | Полный collect-all зависимостей |
| `python-backend/requirements.txt` | то же | Все пакеты без урезания |
| `scripts/*.ps1` | `project/scripts` | Сборка API и установщика |

Проверьте, что в `python-backend/api.py` уже есть `NEVZ_DB_PATH` (в репозитории есть). Если нет — см. `python-backend/api_db_snippet.py`.

Иконки: `electron-app/renderer/assets/icons/app-icon.ico` и `.png` (без двойного `.png.png`).

---

## 3. Сборка API (долго: 20–60+ мин)

```powershell
cd C:\MYDESK\code\NEVZ\EVA\manufacturing-optimizer
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\1_build_api.ps1
```

Результат: `python-backend\dist\nevz-api\nevz-api.exe` + папка `_internal`.

**Проверка:**

```powershell
cd python-backend\dist\nevz-api
New-Item -ItemType Directory -Force C:\Temp | Out-Null
$env:NEVZ_DB_PATH="C:\Temp\nevz_test.db"
.\nevz-api.exe
```

Браузер: http://127.0.0.1:8000/docs  
Остановить: Ctrl+C.

Если `No module named 'uvicorn'` — в venv `pip install uvicorn[standard]` и снова `1_build_api.ps1`.

---

## 4. Сборка установщика Electron

```powershell
cd C:\MYDESK\code\NEVZ\EVA\manufacturing-optimizer
.\scripts\2_build_installer.ps1
```

Результат:  
`electron-app\dist\MfgOptimizer-Setup-1.0.0.exe`

---

## 5. Или одной командой (после apply kit)

```powershell
cd C:\MYDESK\code\NEVZ\EVA\manufacturing-optimizer
.\scripts\build_all.ps1
```

---

## 6. Установка и проверка

1. Запустить Setup → установить.  
2. Ярлык **MfgOptimizer**.  
3. Диспетчер задач: `MfgOptimizer.exe` + `nevz-api.exe`.  
4. БД: `%APPDATA%\MfgOptimizer\manufacturing.db`.  
5. Логин, API http://127.0.0.1:8000/docs.

На **другом ПК** Python/Node **не нужны** — только Setup.

---

## Схема (что куда попадает)

```
Installer
├── MfgOptimizer.exe          (Electron UI)
├── resources/
│   ├── app.asar              (renderer + main)
│   ├── nevz-api/
│   │   ├── nevz-api.exe      (FastAPI + ML)
│   │   └── _internal/        (все pip-пакеты)
│   └── data/manufacturing.db (сид при первом запуске)
└── → копия БД в %APPDATA%\MfgOptimizer\
```

Dev: `npm start` → `python api.py`.  
Prod: `isPackaged()` → `spawn(nevz-api.exe)` + `NEVZ_DB_PATH`.

---

## Частые ошибки

| Ошибка | Действие |
|--------|----------|
| Python 3.14 | Поставьте 3.11/3.12 |
| Нет nevz-api.exe при build installer | Сначала `1_build_api.ps1` |
| Порт 8000 занят | Закройте старый python/uvicorn |
| Нет иконки | Исправьте имя app-icon.ico |
| ExecutionPolicy | `Set-ExecutionPolicy -Scope Process Bypass` |
