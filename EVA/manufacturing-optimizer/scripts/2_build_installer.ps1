# Сборка MfgOptimizer-Setup.exe
# Требует: уже собранный python-backend\dist\nevz-api\
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location (Join-Path $root "electron-app")

if (-not (Test-Path ..\python-backend\dist\nevz-api\nevz-api.exe)) {
  throw "Сначала выполните scripts\1_build_api.ps1 — нет nevz-api.exe"
}
if (-not (Test-Path ..\python-backend\manufacturing.db)) {
  Write-Host "WARN: manufacturing.db missing — installer without seed DB" -ForegroundColor Yellow
}

Write-Host "=== npm install ===" -ForegroundColor Cyan
npm install
npm install --save-dev electron@27 electron-builder@24

Write-Host "=== electron-builder NSIS ===" -ForegroundColor Cyan
npm run dist

Write-Host "Готово. Ищите Setup в electron-app\dist\" -ForegroundColor Green
Get-ChildItem dist\*.exe | ForEach-Object { $_.FullName }
