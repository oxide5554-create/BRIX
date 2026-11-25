@echo off
rem BRIX v0.5.22 — сборка Rust-утилит (brix-ping, brix-info) под Windows.
rem Требуется Rust: https://rustup.rs (одна команда — curl https://sh.rustup.rs -sSf | sh
rem или скачай rustup-init.exe с https://www.rust-lang.org/tools/install)
rem После сборки exe появятся в rust\brix-utils\target\release\

cd /d "%~dp0\brix-utils"

where cargo >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Rust (cargo) не найден! Установи: https://rustup.rs
  echo  После установки перезапусти этот файл.
  pause
  exit /b 1
)

echo Собираю brix-ping и brix-info (release)...
cargo build --release
if errorlevel 1 (
  echo Ошибка сборки — проверь вывод выше.
  pause
  exit /b 1
)

echo.
echo Готово! Утилиты здесь:
echo   rust\brix-utils\target\release\brix-ping.exe
echo   rust\brix-utils\target\release\brix-info.exe
echo.
echo Проверка пинга до твоего сервера:
echo   brix-ping ws localhost:8787 20
echo   brix-ping ws lpxm82mp-8787.euw.devtunnels.ms 20   (адрес твоего туннеля)
pause
