@echo off
rem BRIX v0.5.22 — BrixLand (выживание) на порту 8787

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js не найден! Скачай и установи: https://nodejs.org
  pause
  exit /b 1
)

echo Запускаю BRIX • BrixLand (выживание, порт 8787)...
start "BRIX • BrixLand" cmd /c "set BRIX_REALM=brixland&& set BRIX_PORT=8787&& node server.js & pause"
timeout /t 1 >nul
start "" http://localhost:8787
echo Готово! BrixLand: http://localhost:8787
timeout /t 3 >nul
