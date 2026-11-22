@echo off
setlocal
cd /d "%~dp0.."
echo 1. Syncing prompts for any newly added cards (preserving all existing edited prompts)...
node tools\build_prompts.js
if errorlevel 1 pause & exit /b 1
echo.
echo 2. Generating art ONLY for cards missing artwork (approved and existing art is untouched)...
"C:\AI\ComfyUI\.venv\Scripts\python.exe" -u "tools\gen_local_art.py" --model realvis --batch all
echo.
echo Done! Open tools\start_art_review.cmd to inspect and approve the new cards.
pause
