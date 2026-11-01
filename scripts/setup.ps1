# One-time setup for CODEMIND AI on Windows: backend virtual environment, dependencies, database, frontend packages.
# Run from the project folder:   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Write-Host '== Backend: virtual environment and packages' -ForegroundColor Cyan
Set-Location "$root\backend"
if (-not (Test-Path '.venv')) { python -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host 'Created backend\.env (edit it to enable an AI provider; scanning works without one).' -ForegroundColor Yellow
}

Write-Host '== Backend: database' -ForegroundColor Cyan
& .\.venv\Scripts\python.exe -c "from app.config import load_settings; from app.db import Database; s = load_settings(); Database(s.db_path).init(); print('Database ready:', s.db_path)"

Write-Host '== Frontend: npm packages' -ForegroundColor Cyan
Set-Location "$root\agent_pro"
npm install

Write-Host ''
Write-Host 'Setup finished. Start the app with:  powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1' -ForegroundColor Green
