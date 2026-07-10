#!/bin/bash

echo "================================================================"
echo "   MANUFACTURING OPTIMIZER - STARTUP"
echo "================================================================"
echo ""

echo "[1/3] Checking Python..."
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python not found! Please install Python 3.9+"
    exit 1
fi
echo "[OK] Python found"

echo ""
echo "[2/3] Starting Python Backend..."
cd python-backend
python3 api.py &
PYTHON_PID=$!
cd ..

echo ""
echo "[3/3] Waiting for API..."
sleep 3

echo ""
echo "[4/4] Starting Electron App..."
cd electron-app
npm start

echo ""
echo "================================================================"
echo "   Application started!"
echo "================================================================"

# Ожидание завершения
wait $PYTHON_PID