# Копирует файлы из KIT в клон репозитория.
# Использование:
#   cd C:\path\to\NEVZ_EXE_BUILD_KIT
#   .\scripts\0_apply_kit_to_project.ps1 -ProjectRoot "C:\MYDESK\code\NEVZ\EVA\manufacturing-optimizer"
param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot
)
$ErrorActionPreference = "Stop"
$KitRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ProjectRoot = Resolve-Path $ProjectRoot

Copy-Item "$KitRoot\electron-app\main.js" "$ProjectRoot\electron-app\main.js" -Force
Copy-Item "$KitRoot\electron-app\electron-builder.json" "$ProjectRoot\electron-app\electron-builder.json" -Force
Copy-Item "$KitRoot\electron-app\package.json" "$ProjectRoot\electron-app\package.json" -Force
Copy-Item "$KitRoot\python-backend\run_api.py" "$ProjectRoot\python-backend\run_api.py" -Force
Copy-Item "$KitRoot\python-backend\nevz-api.spec" "$ProjectRoot\python-backend\nevz-api.spec" -Force
Copy-Item "$KitRoot\python-backend\requirements.txt" "$ProjectRoot\python-backend\requirements.txt" -Force
New-Item -ItemType Directory -Force -Path "$ProjectRoot\scripts" | Out-Null
Copy-Item "$KitRoot\scripts\*.ps1" "$ProjectRoot\scripts\" -Force
Copy-Item "$KitRoot\docs\BUILD_EXE.md" "$ProjectRoot\docs\BUILD_EXE.md" -Force -ErrorAction SilentlyContinue
Copy-Item "$KitRoot\BUILD_EXE.md" "$ProjectRoot\BUILD_EXE.md" -Force

Write-Host "Kit applied to $ProjectRoot" -ForegroundColor Green
Write-Host "Next: open VS Code terminal in project root, run scripts." -ForegroundColor Yellow
