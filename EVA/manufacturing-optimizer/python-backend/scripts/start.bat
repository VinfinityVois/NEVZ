@echo off
chcp 65001 >nul
echo ================================================================
echo    MANUFACTURING OPTIMIZER - STARTUP
echo ================================================================
echo.

echo [1/4] Checking directories...
if not exist "python-backend" (
    echo [ERROR] python-backend directory not found!
    mkdir python-backend
    echo [INFO] Created python-backend directory
)
if not exist "electron-app" (
    echo [ERROR] electron-app directory not found!
    mkdir electron-app
    echo [INFO] Created electron-app directory
)
echo [OK] Directories checked

echo.
echo [2/4] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found!
    pause
    exit /b 1
)
echo [OK] Python found

echo.
echo [3/4] Starting Python Backend...
cd python-backend

REM Проверяем наличие api.py
if not exist "api.py" (
    echo [ERROR] api.py not found in python-backend!
    echo [INFO] Creating basic api.py...
    (
        echo from fastapi import FastAPI
        echo import uvicorn
        echo.
        echo app = FastAPI^(^)
        echo.
        echo @app.get^("/"^)
        echo async def root^(^):
        echo     return ^{"status": "running", "service": "Manufacturing Optimizer"^}
        echo.
        echo if __name__ == "__main__":
        echo     uvicorn.run^("api:app", host="127.0.0.1", port=8000, reload=True^)
    ) > api.py
    echo [INFO] Created basic api.py
)

start /B python api.py
cd ..

echo [OK] Python backend started (PID might be in background)

echo.
echo [4/4] Waiting for API to be ready...
timeout /t 3 /nobreak >nul

echo.
echo [5/5] Starting Electron App...
cd electron-app

REM Проверяем наличие package.json
if not exist "package.json" (
    echo [WARNING] package.json not found!
    echo [INFO] Initializing npm project...
    call npm init -y
    call npm install electron --save-dev
)

REM Проверяем наличие main.js
if not exist "main.js" (
    echo [ERROR] main.js not found!
    echo [INFO] Creating basic main.js...
    (
        echo const { app, BrowserWindow } = require^('electron'^);
        echo const path = require^('path'^);
        echo.
        echo function createWindow^(^) {
        echo     const win = new BrowserWindow^({
        echo         width: 1200,
        echo         height: 800,
        echo         webPreferences: ^{
        echo             nodeIntegration: false,
        echo             contextIsolation: true
        echo         ^}
        echo     ^}^);
        echo     win.loadFile^(path.join^(__dirname, 'renderer', 'index.html'^)^);
        echo ^}
        echo.
        echo app.whenReady^(^).then^(createWindow^);
    ) > main.js
    echo [INFO] Created basic main.js
)

start /B npm start
cd ..

echo.
echo ================================================================
echo    APPLICATION STARTED!
echo ================================================================
echo.
echo Python API: http://127.0.0.1:8000
echo Electron App: Should be opening...
echo.
echo Press any key to stop all processes...
pause >nul

REM Остановка процессов при закрытии
taskkill /F /IM python.exe /FI "WINDOWTITLE eq api.py*" 2>nul
taskkill /F /IM electron.exe 2>nul