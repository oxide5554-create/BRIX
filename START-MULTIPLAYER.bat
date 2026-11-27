@echo off
rem BRIX v0.5.24 — запуск МУЛЬТИПЛЕЕРА: ДВА СЕРВЕРА ОДНОВРЕМЕННО
rem   BRIX • Генерация (процедурная карта) — http://localhost:8789
rem   BRIX • BrixPvP   (пвп-арена)  — http://localhost:8788  (BRIX_REALM=brixpvp)
rem У каждого сервера СВОИ сохранения (data/brixwipe/ и data/brixpvp/),
rem свои игроки и свой счётчик онлайна. admins.json/bans.json — общие.
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

echo Запускаю BRIX • Генерация (процедурная карта, порт 8789)...
start "BRIX • Генерация" cmd /c "set BRIX_REALM=brixwipe&& set BRIX_PORT=8789&& node server.js & pause"
timeout /t 1 >nul
echo Запускаю BRIX • BrixPvP (пвп-арена, порт 8788)...
start "BRIX • BrixPvP" cmd /c "set BRIX_REALM=brixpvp&& set BRIX_PORT=8788&& node server.js & pause"
timeout /t 1 >nul
start "" http://localhost:8789
echo Готово! Открывай http://localhost:8789 — вкладка СЕРВЕРА покажет
echo оба сервера с живыми счётчиками игроков.
timeout /t 4 >nul
