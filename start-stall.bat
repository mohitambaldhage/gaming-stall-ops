@echo off
cd /d "%~dp0"
echo Starting Nov 28 Gaming Stall Ops on http://localhost:4321 ...
start "" "http://localhost:4321"
node server/server.mjs
pause
