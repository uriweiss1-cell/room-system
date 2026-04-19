@echo off
echo Starting Room Assignment System...
start "Server" cmd /k "cd /d "%~dp0server" && npm run dev"
timeout /t 2 /nobreak > nul
start "Client" cmd /k "cd /d "%~dp0client" && npm run dev"
timeout /t 3 /nobreak > nul
start http://localhost:5173
