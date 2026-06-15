@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-ngrok.ps1" -Authtoken "%~1"
if errorlevel 1 pause
