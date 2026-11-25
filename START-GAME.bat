@echo off
rem BRIX v0.5.22 — быстрый старт ИГРОКИ (меню + выживание):
rem   МЕНЮ     — http://localhost:8780  (интерфейс)
rem   BrixLand — http://localhost:8787  (выживание)
rem Для всех серверов сразу (арена 8788, вайп 8789) — START-ALL.bat.
rem Требуется Node.js (https://nodejs.org).

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js не найден! Скачай и установи: https://nodejs.org
  echo  А пока открываю игру в одиночном режиме...
  start "" "%~dp0index.html"
  pause
  exit /b 1
)

echo Запускаю BRIX • Меню (порт 8780)...
start "BRIX • Menu" cmd /c "set BRIX_REALM=menu&& set BRIX_PORT=8780&& node server.js & pause"
timeout /t 1 >nul
echo Запускаю BRIX • BrixLand (выживание, порт 8787)...
start "BRIX • BrixLand" cmd /c "set BRIX_REALM=brixland&& set BRIX_PORT=8787&& node server.js & pause"
timeout /t 1 >nul
start "" http://localhost:8780
echo Готово! Меню: http://localhost:8780 · Выживание: http://localhost:8787
timeout /t 4 >nul
