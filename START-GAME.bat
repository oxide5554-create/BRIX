@echo off
rem BRIX v0.5.24 — быстрый старт ИГРОКИ (меню + процедурная карта):
rem   МЕНЮ      — http://localhost:8780  (интерфейс)
rem   Генерация — http://localhost:8789  (выживание на архипелаге)
rem Для всех серверов сразу (арена 8788) — START-ALL.bat.
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
echo Запускаю BRIX • Генерация (процедурная карта, порт 8789)...
start "BRIX • Генерация" cmd /c "set BRIX_REALM=brixwipe&& set BRIX_PORT=8789&& node server.js & pause"
timeout /t 1 >nul
start "" http://localhost:8780
echo Готово! Меню: http://localhost:8780 · Игра: http://localhost:8789
timeout /t 4 >nul
