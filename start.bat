@echo off
rem Chay game LF2 web: bat may chu (khong cache) roi mo trinh duyet.
rem Giu cua so nay mo trong luc choi; dong cua so = tat may chu.
cd /d "%~dp0"
set PORT=8780
echo Dang chay LF2 web tai http://127.0.0.1:%PORT%/
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" http://127.0.0.1:%PORT%/"
python tools\serve.py %PORT%
if errorlevel 1 (
  echo.
  echo Khong chay duoc may chu. Kiem tra Python da cai chua: python --version
  pause
)
