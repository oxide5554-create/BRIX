@echo off
chcp 65001 >nul
setlocal
title BRIX - загрузка игры на GitHub

rem ============================================================
rem  BRIX - АВТОЗАГРУЗКА ИГРЫ В ТВОЙ РЕПОЗИТОРИЙ НА GITHUB
rem
rem  КАК ПОЛЬЗОВАТЬСЯ (один раз):
rem   1. Создай ПУСТОЙ репозиторий на github.com
rem      (плюс в правом верхнем углу - New repository -
rem       имя например "brix" - НЕ добавляй README - Create)
rem   2. Скопируй ссылку репозитория, вида:
rem      https://github.com/ТВОЙ_ЛОГИН/brix.git
rem   3. Впиши её ниже в REPO_URL (между кавычками)
rem   4. Положи этот батник В ПАПКУ ИГРЫ (рядом с server.js)
rem   5. Запусти двойным кликом.
rem
rem  При ПЕРВОМ push откроется окно входа GitHub - войди в браузере,
rem  дальше запомнит и будет загружать в один клик.
rem  Запускай этот батник КАЖДЫЙ РАЗ, когда хочешь сохранить игру
rem  в репозиторий - он сам добавит изменения и зальёт их.
rem ============================================================

rem ===== НАСТРОЙКИ - впиши сюда СВОЮ ссылку =====
set "https://github.com/oxide5554-create/BRIX.git"
rem ==============================================

cd /d "%~dp0"

rem --- проверка: батник лежит в папке игры? ---
if not exist "server.js" (
    echo [ОШИБКА] Рядом с батником нет server.js.
    echo Положи этот батник В ПАПКУ ИГРЫ, рядом с server.js и START-MULTIPLAYER.bat
    pause
    exit /b 1
)

rem --- проверка: установлен ли git ---
where git >nul 2>nul
if errorlevel 1 (
    echo [ОШИБКА] Git не установлен.
    echo Скачай и установи: https://git-scm.com/download/win
    echo При установке везде жми Next - этого достаточно.
    pause
    exit /b 1
)

rem --- проверка: вписана ли ссылка на репозиторий ---
echo %REPO_URL% | findstr /C:"ТВОЙ_ЛОГИН" >nul
if not errorlevel 1 (
    echo [НАСТРОЙКА] Сначала впиши ссылку своего репозитория!
    echo Открой этот файл блокнотом и в строке
    echo     set "REPO_URL=https://github.com/ТВОЙ_ЛОГИН/brix.git"
    echo замени ТВОЙ_ЛОГИН/brix на свой логин и имя репозитория.
    pause
    exit /b 1
)

echo ============================================
echo  BRIX - загрузка в репозиторий
echo  Репозиторий: %REPO_URL%
echo ============================================

rem --- первый запуск: создаём .gitignore ---
if not exist ".gitignore" (
    echo world-objs.json> .gitignore
    echo [OK] Создан .gitignore - серверный файл world-objs.json
    echo      не будет заливаться, это состояние мира на сервере.
)

rem --- первый запуск: git init + удалённый репозиторий ---
if not exist ".git" (
    echo [1/4] Первый запуск - инициализирую репозиторий...
    git init
    git branch -M main
    git remote add origin "%REPO_URL%"
    echo [OK] Репозиторий создан, ссылка привязана.
) else (
    echo [1/4] Репозиторий уже есть - обновляю ссылку на случай правки...
    git remote set-url origin "%REPO_URL%"
)

rem --- если git не знает имя автора - ставим локальное, чтобы не спросил ---
git config user.name >nul 2>nul
if errorlevel 1 (
    git config user.name "BRIX Dev"
    git config user.email "brix@dev.local"
)

rem --- добавляем и коммитим ---
echo [2/4] Добавляю файлы игры...
git add -A
echo [3/4] Коммит...
git commit -m "BRIX v0.4.3 - обновление игры - %date% %time%"
if errorlevel 1 (
    echo [OK] Изменений нет - всё уже загружено, коммитить нечего.
    pause
    exit /b 0
)

rem --- заливаем ---
echo [4/4] Заливаю на GitHub...
git push -u origin main
if errorlevel 1 (
    echo.
    echo [ОШИБКА] GitHub не принял загрузку. Самые частые причины:
    echo  1. Ссылка REPO_URL неверна - проверь логин и имя репозитория.
    echo  2. Репозиторий не ПУСТОЙ: если там уже есть README,
    echo     выполни один раз в папке игры:
    echo         git pull origin main --allow-unrelated-histories
    echo     и запусти батник снова.
    echo  3. Не выполнен вход: при первом push должно открыться
    echo     окно входа GitHub в браузере. Если не открылось - запусти:
    echo         git credential-manager github login
    echo  4. Нет интернета.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  ГОТОВО! Игра залита в репозиторий:
echo  %REPO_URL%
echo  Открой страницу в браузере и обнови - файлы там.
echo ============================================
pause
