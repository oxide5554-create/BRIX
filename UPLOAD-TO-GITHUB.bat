@echo off
chcp 65001 >nul
setlocal
title BRIX - загрузка игры на GitHub

rem ============================================================
rem  BRIX - АВТОЗАГРУЗКА ИГРЫ В ТВОЙ РЕПОЗИТОРИЙ НА GITHUB
rem
rem  КАК ПОЛЬЗОВАТЬСЯ:
rem   1. Репозиторий на github.com должен быть создан и ПУСТОЙ.
rem   2. Положи этот батник В ПАПКУ ИГРЫ - рядом с server.js.
rem   3. Запусти двойным кликом.
rem   4. При первом запуске он сам спросит ссылку репозитория -
rem      просто вставь её и нажми Enter.
rem      РЕДАКТИРОВАТЬ ЭТОТ ФАЙЛ НЕ НУЖНО.
rem
rem  При первом push откроется окно входа GitHub - войди,
rem  дальше запомнит. Запускай батник каждый раз, когда хочешь
rem  сохранить игру - он сам зальёт изменения.
rem ============================================================

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

set "REPO_URL="
set "EXISTING_URL="

rem --- читаем привязку напрямую из конфига git ---
rem (git remote get-url врёт: при пустой ссылке печатает слово "origin")
if exist ".git" (
    for /f "delims=" %%u in ('git config --get remote.origin.url 2^>nul') do set "EXISTING_URL=%%u"
)

rem --- доверяем только настоящей ссылке GitHub ---
if not defined EXISTING_URL goto ASK_URL
set "OKURL="
if "%EXISTING_URL:~0,19%"=="https://github.com/" set "OKURL=1"
if "%EXISTING_URL:~0,18%"=="http://github.com/" set "OKURL=1"
if "%EXISTING_URL:~0,15%"=="git@github.com:" set "OKURL=1"
if not defined OKURL goto ASK_URL
set "REPO_URL=%EXISTING_URL%"
echo Репозиторий уже привязан: %REPO_URL%
goto HAVE_URL

:ASK_URL
echo.
echo  Вставь ссылку своего репозитория и нажми Enter.
echo  Например: https://github.com/oxide5554-create/BRIX.git
echo  Вставляй БЕЗ кавычек. Ctrl+V или правый клик - вставить.
echo.
set /p REPO_URL="Ссылка: "
if "%REPO_URL%"=="" (
    echo [ОШИБКА] Ссылка пустая.
    pause
    exit /b 1
)
rem --- убираем случайные пробелы при вставке ---
set "REPO_URL=%REPO_URL: =%"
set "OKURL="
if "%REPO_URL:~0,19%"=="https://github.com/" set "OKURL=1"
if "%REPO_URL:~0,18%"=="http://github.com/" set "OKURL=1"
if "%REPO_URL:~0,15%"=="git@github.com:" set "OKURL=1"
if not defined OKURL (
    echo [ОШИБКА] Это не похоже на ссылку репозитория GitHub.
    echo Должно быть так: https://github.com/ЛОГИН/ИМЯ.git
    echo Скопируй ссылку со страницы репозитория: зелёная кнопка
    echo Code, вкладка HTTPS.
    pause
    exit /b 1
)

:HAVE_URL
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

rem --- первый запуск: git init ---
if not exist ".git" (
    echo [1/4] Инициализирую репозиторий...
    git init
    git branch -M main
) else (
    echo [1/4] Репозиторий уже создан - ок.
)

rem --- убираем предупреждения про LF/CRLF ---
git config core.autocrlf false

rem --- привязываем ссылку: если была пустая или битая - исправляем ---
git remote get-url origin >nul 2>nul
if errorlevel 1 (
    git remote add origin "%REPO_URL%"
    echo [OK] Ссылка привязана.
) else (
    git remote set-url origin "%REPO_URL%"
    echo [OK] Ссылка привязана / обновлена.
)

rem --- если git не знает имя автора - ставим локальное ---
git config user.name >nul 2>nul
if errorlevel 1 (
    git config user.name "BRIX Dev"
    git config user.email "brix@dev.local"
)

rem --- добавляем и коммитим ---
echo [2/4] Добавляю файлы игры...
git add -A
echo [3/4] Сохраняю изменения...
git commit -m "BRIX v0.4.3 - обновление игры - %date% %time%"
if errorlevel 1 (
    echo Новых изменений нет - игра уже сохранена, проверяю GitHub...
)

rem --- заливаем (делаем всегда, даже без новых изменений) ---
echo [4/4] Заливаю на GitHub...
git push -u origin main
if errorlevel 1 (
    echo.
    echo [ОШИБКА] GitHub не принял загрузку. Причины:
    echo  1. Ссылка неверна. Открой свой репозиторий на GitHub,
    echo     нажми зелёную кнопку Code и скопируй HTTPS-ссылку.
    echo  2. Репозиторий НЕ пустой - создан с README. Тогда один раз
    echo     выполни в папке игры команду:
    echo         git pull origin main --allow-unrelated-histories
    echo     и запусти батник снова.
    echo  3. Не выполнен вход. Запусти команду:
    echo         git credential-manager github login
    echo  4. Нет интернета.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  ГОТОВО! Игра залита. Открой в браузере:
echo  %REPO_URL:.git=%
echo ============================================
pause
