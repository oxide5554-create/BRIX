@echo off
chcp 65001 >nul
title BRIX - localhost:8080
echo ==============================================
echo    BRIX - zapusk igry na localhost:8080
echo    Ne zakryvayte eto okno vo vremya igry!
echo ==============================================
where python >nul 2>nul
if %errorlevel%==0 (
    start "" http://localhost:8080
    python -m http.server 8080
) else (
    echo Python ne nayden - otkryvayu igru napryamuyu...
    start "" "%~dp0index.html"
)
pause
