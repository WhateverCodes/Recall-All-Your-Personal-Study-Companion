@echo off
cd /d "%~dp0"
node launch-dashboard.cjs
if errorlevel 1 pause
