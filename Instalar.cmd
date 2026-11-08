@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0installer\Instalar.ps1"
if errorlevel 1 pause
