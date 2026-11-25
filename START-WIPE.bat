@echo off
rem BRIX v0.5.22 — BrixWipe (вайп-мир) на порту 8789
rem Сервер САМ тикает время до вайпа (каждые СУТКИ): в момент вайпа
rem мир стирается, берётся НОВЫЙ сид и карта генерируется заново
rem (пустыня + арктика + кактусы). Тайминг живёт в data/brixwipe/wipe.json
rem и переживает рестарт сервера.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js не найден! Скачай и установи: https://nodejs.org
  pause
  exit /b 1
)

echo Запускаю BRIX • BrixWipe (вайп-мир, порт 8789)...
start "BRIX • BrixWipe" cmd /c "set BRIX_REALM=brixwipe&& set BRIX_PORT=8789&& node server.js & pause"
timeout /t 1 >nul
echo Готово! Вайп-мир: http://localhost:8789 (вход через меню — вкладка СЕРВЕРА)
timeout /t 3 >nul
