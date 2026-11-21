@echo off
rem BRIX v0.4.64 — запуск МУЛЬТИПЛЕЕРА: ДВА СЕРВЕРА ОДНОВРЕМЕННО
rem   BRIX • BrixLand  (выживание)  — http://localhost:8787  (node server.js)
rem   BRIX • BrixPvP   (пвп-арена)  — http://localhost:8788  (BRIX_REALM=brixpvp)
rem У каждого сервера СВОИ сохранения (data/brixland/ и data/brixpvp/),
rem свои игроки и свой счётчик онлайна. admins.json/bans.json — общие.
rem Требуется Node.js (https://nodejs.org).

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js не найден! Скачай и установи: https://nodejs.org
  echo  А пока открываю игру в одиночном режиме...
  start "" http://localhost:8787
  start "" "%~dp0index.html"
  pause
  exit /b 1
)

echo Запускаю BRIX • BrixLand (выживание, порт 8787)...
start "BRIX • BrixLand" cmd /c "node server.js & pause"
timeout /t 1 >nul
echo Запускаю BRIX • BrixPvP (пвп-арена, порт 8788)...
start "BRIX • BrixPvP" cmd /c "set BRIX_REALM=brixpvp&& set BRIX_PORT=8788&& node server.js & pause"
timeout /t 1 >nul
start "" http://localhost:8787
echo Готово! Открывай http://localhost:8787 — вкладка СЕРВЕРА покажет
echo оба сервера с живыми счётчиками игроков.
timeout /t 4 >nul
