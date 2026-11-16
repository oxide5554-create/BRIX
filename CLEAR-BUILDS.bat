@echo off
rem ============================================================
rem  BRIX v0.4.14 - OCHISTKA SERVERA OT VSEKH POSTROEK
rem  Udalyayet fundamenty / steny / okna / dveri / potolki.
rem  Lut yashchikov, bochki i dropy NE trogayet.
rem  Pered udaleniyem delayetsya strakhovochnaya kopiya.
rem
rem  Pochemu BAT, a ne .cmd i pochemu tekst latinitej:
rem  cmd.exe na Windows cposakaetsya na LF-fajlakh s goto
rem  (okno zakryvaetsya mgnovenno) i na kirillicheskikh
rem  imenakh, pobitykh pri raspakovke ZIP. Teper nadezhno.
rem ============================================================
chcp 65001 >nul
title BRIX - CLEAR BUILDS
cd /d "%~dp0"

cls
echo ==============================================
echo    BRIX - OCHISTKA SERVERA OT VSEKH POSTROEK
echo ==============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js ne nayden! Skachay i ustanovi: https://nodejs.org
  echo.
  pause
  goto :done
)

rem --- server rabotayet? chistit, poka on zhiv, bespolezno ---
set BRIX_FORCE=0
tasklist /FI "IMAGENAME eq node.exe" /NH 2>nul | find /I "node.exe" >nul
if not errorlevel 1 (
  echo  VNIMANIE: SERVER SEYCHAS RABOTAET ^(zapushchen node.exe^)!
  echo  Poka server rabotayet, chistit BESPOLEZNO: on khranit
  echo  postroyki v pamyati i zapishet ikh obratno pri ostanovke.
  echo.
  echo  Pravilno tak: zakroy CHYORNOE OKNO SERVERA, potom
  echo  zapusti etot batnik zanovo.
  echo.
  choice /c YN /m "Vsyo ravno poprobovat? (Y - da, N - net)"
  if errorlevel 2 goto :done
  set BRIX_FORCE=1
)

echo.
choice /c YN /m "Udalit VSE postroyki? (Y - da, N - net)"
if errorlevel 2 goto :done

echo.
node "%~dp0clear-builds.js"
echo.
pause

:done
