@echo off
rem BRIX v0.3.0 — запуск МУЛЬТИПЛЕЕРА (сервер + игра)
rem Требуется Node.js (https://nodejs.org). Если node не установлен —
rem игра всё равно запустится двойным щелчком по START-GAME.bat,
rem а мультиплеер будет работать между вкладками одного браузера.

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

echo Запускаю сервер мультиплеера...
start "BRIX сервер" cmd /c "node server.js & pause"
timeout /t 1 >nul
start "" http://localhost:8787
echo Готово! Открывай http://localhost:8787 в нескольких окнах —
echo каждое окно будет отдельным игроком.
timeout /t 4 >nul
