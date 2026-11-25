@echo off
rem BRIX v0.5.22 — BrixPvP (пвп-арена «Полигон») на порту 8788

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js не найден! Скачай и установи: https://nodejs.org
  pause
  exit /b 1
)

echo Запускаю BRIX • BrixPvP (пвп-арена, порт 8788)...
start "BRIX • BrixPvP" cmd /c "set BRIX_REALM=brixpvp&& set BRIX_PORT=8788&& node server.js & pause"
timeout /t 1 >nul
echo Готово! Арена: http://localhost:8788 (вход через меню — вкладка СЕРВЕРА)
timeout /t 3 >nul
