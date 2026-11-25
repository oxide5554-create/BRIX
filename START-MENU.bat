@echo off
rem BRIX v0.5.22 — МЕНЮ на порту 8780 (реалм menu)
rem Меню отделено от игровых серверов: 8780 раздаёт ТОЛЬКО интерфейс.
rem Игровые сервера запускаются отдельно (START-LAND / START-PVP / START-WIPE
rem или всё сразу — START-ALL.bat). Требуется Node.js (https://nodejs.org).

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js не найден! Скачай и установи: https://nodejs.org
  pause
  exit /b 1
)

echo Запускаю BRIX • Меню (порт 8780)...
start "BRIX • Menu" cmd /c "set BRIX_REALM=menu&& set BRIX_PORT=8780&& node server.js & pause"
timeout /t 1 >nul
start "" http://localhost:8780
echo Готово! Меню открыто на http://localhost:8780
timeout /t 3 >nul
