@echo off
rem BRIX v0.5.24 — ВСЕ 3 СЕРВЕРА ОДНИМ ЗАПУСКОМ (карта BrixLand удалена):
rem   МЕНЮ      — http://localhost:8780  (только интерфейс)
rem   Генерация — http://localhost:8789  (процедурная карта-архипелаг,
rem                                     вайп раз в сутки, аирдропы с C4)
rem   BrixPvP   — http://localhost:8788  (пвп-арена «Полигон»)
rem У каждого СВОИ сохранения (data/<realm>/) и СВОЙ инвентарь игроков.
rem admins.json и bans.json — общие. Требуется Node.js (https://nodejs.org).

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
echo Запускаю BRIX • BrixPvP (пвп-арена, порт 8788)...
start "BRIX • BrixPvP" cmd /c "set BRIX_REALM=brixpvp&& set BRIX_PORT=8788&& node server.js & pause"
timeout /t 1 >nul
echo Запускаю BRIX • Генерация (процедурная карта, порт 8789)...
start "BRIX • Генерация" cmd /c "set BRIX_REALM=brixwipe&& set BRIX_PORT=8789&& node server.js & pause"
timeout /t 1 >nul
start "" http://localhost:8780
echo.
echo Готово! Меню: http://localhost:8780
echo Игровые сервера: 8789 (процедурная карта) · 8788 (арена)
echo Dev Tunnels: пробрось порты 8780/8788/8789 — адреса подставятся сами.
timeout /t 5 >nul
