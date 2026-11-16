@echo off
rem Double-click to start OnCurve on Windows.
rem Checks that Node.js is installed, runs the one-time setup if needed, then starts the
rem app and opens it in the browser. Works from a folder whose path contains spaces.

setlocal
cd /d "%~dp0"
title OnCurve

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed, or it is not on the PATH.
  echo Install the LTS version from https://nodejs.org, then double-click this file again.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=v." %%v in ('node -v') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (
  echo OnCurve needs Node.js 22 or newer. This computer has:
  node -v
  echo Install the LTS version from https://nodejs.org, then try again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First start: running the one-time setup. This takes a minute or two.
  call npm run setup
  if errorlevel 1 (
    echo.
    echo Setup did not finish. The error is shown above.
    pause
    exit /b 1
  )
)

call npm start
if errorlevel 1 pause
endlocal
