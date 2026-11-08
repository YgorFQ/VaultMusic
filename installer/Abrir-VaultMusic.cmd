@echo off
chcp 65001 >nul
cd /d "%~dp0"
"%~dp0youtube\node.exe" "%~dp0youtube\start.mjs"
if errorlevel 1 (
  echo.
  echo Consulte o tutorial e os registros em youtube\data.
  pause
)
