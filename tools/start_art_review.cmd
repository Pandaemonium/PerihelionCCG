@echo off
setlocal
cd /d "%~dp0.."
echo Starting Tau Ceti Art Review Studio (Intel Arc A750 live reroll enabled)...
"C:\AI\ComfyUI\.venv\Scripts\python.exe" -u "tools\review_server.py" 8795 --open
pause
