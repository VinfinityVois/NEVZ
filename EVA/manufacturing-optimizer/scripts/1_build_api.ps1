# Сборка nevz-api.exe (полный requirements)
# Запускать из: manufacturing-optimizer\python-backend
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..\python-backend

Write-Host "=== 1. Venv ===" -ForegroundColor Cyan
if (-not (Test-Path .venv-build)) {
  python -m venv .venv-build
}
.\.venv-build\Scripts\Activate.ps1
python -m pip install -U pip wheel setuptools
pip install -r requirements.txt
pip install "uvicorn[standard]>=0.24.0"
pip install pyinstaller

Write-Host "=== 2. Check imports ===" -ForegroundColor Cyan
python -c "import uvicorn, fastapi, sklearn; print('OK', uvicorn.__file__)"

Write-Host "=== 3. PyInstaller ===" -ForegroundColor Cyan
Remove-Item -Recurse -Force dist\nevz-api, build\nevz-api -ErrorAction SilentlyContinue
if (Test-Path nevz-api.spec) {
  pyinstaller --noconfirm --clean nevz-api.spec
} else {
  pyinstaller --noconfirm --clean --name nevz-api --paths . `
    --hidden-import=uvicorn --hidden-import=uvicorn.logging `
    --hidden-import=uvicorn.loops.auto --hidden-import=uvicorn.protocols.http.auto `
    --hidden-import=uvicorn.protocols.websockets.auto --hidden-import=uvicorn.lifespan.on `
    --hidden-import=api --hidden-import=auth_api `
    --collect-all=uvicorn --collect-all=starlette --collect-all=fastapi --collect-all=anyio `
    --collect-all=sklearn --collect-all=xgboost --collect-all=lightgbm --collect-all=catboost `
    --collect-all=shap --collect-all=ortools --collect-all=networkx --collect-all=pandas `
    --collect-all=numpy --collect-all=joblib --collect-all=sqlalchemy --collect-all=openpyxl `
    run_api.py
}

Write-Host "=== 4. Test API ===" -ForegroundColor Cyan
if (-not (Test-Path dist\nevz-api\nevz-api.exe)) { throw "nevz-api.exe not built" }
Write-Host "Built: dist\nevz-api\nevz-api.exe" -ForegroundColor Green
Write-Host "Проверка вручную:" -ForegroundColor Yellow
Write-Host '  cd dist\nevz-api'
Write-Host '  $env:NEVZ_DB_PATH="C:\Temp\nevz_test.db"'
Write-Host '  .\nevz-api.exe'
Write-Host '  browser http://127.0.0.1:8000/docs'
