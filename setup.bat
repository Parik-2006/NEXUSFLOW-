@echo off
REM ===== NexusFlow ONE-TIME SETUP: installs ALL dependencies =====
setlocal
set ROOT=%~dp0

echo ============================================
echo   NexusFlow setup - installing dependencies
echo ============================================

echo.
echo [1/2] Installing SERVER dependencies...
pushd "%ROOT%server"
call npm install
popd

echo.
echo [2/2] Installing CLIENT dependencies...
pushd "%ROOT%client"
call npm install --ignore-scripts
popd

echo.
echo ============================================
echo   Setup complete. Now run start.bat
echo ============================================
pause
endlocal
