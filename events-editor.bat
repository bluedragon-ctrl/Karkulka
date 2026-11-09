@echo off
rem Starts the event editor and opens it in the browser.
cd /d "%~dp0"
if not exist node_modules call npm install
start "" http://localhost:5174
npm run events:edit
pause
