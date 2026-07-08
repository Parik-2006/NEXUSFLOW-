@echo off
REM ===== NexusFlow launcher: starts backend + frontend =====
REM First run? Use setup.bat to install everything. This script also
REM auto-installs if node_modules is missing.
setlocal
set "ROOT=%~dp0"

echo Starting NexusFlow...

REM Pin the local backend port to 4000 for this launcher.
REM This overrides any machine-wide PORT variable (e.g. PORT=5000) for this run.
set "PORT=4000"
REM Clear any malformed CI value (e.g. "1 ") so Expo's interactive keys work
REM and its boolean parser does not crash. typescript is already installed,
REM so Expo will not prompt to install it.
set "CI="

REM Free port 4000 if a previous run left a server squatting on it.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":4000 .*LISTENING"') do (
    echo Stopping leftover process on port 4000, PID %%P ...
    taskkill /f /pid %%P >nul 2>&1
)

REM --- Backend (server) ---
if not exist "%ROOT%server\node_modules" (
    echo Installing server dependencies...
    pushd "%ROOT%server"
    call npm install
    popd
)
start "NexusFlow Server" /D "%ROOT%server" cmd /k "echo Local backend running at http://localhost:4000 && echo. && npm run dev"

REM --- Frontend (client) ---
if not exist "%ROOT%client\node_modules" (
    echo Installing client dependencies...
    pushd "%ROOT%client"
    call npm install --ignore-scripts
    popd
)
REM --web launches the browser automatically and prints a clickable web URL.
start "NexusFlow Client" /D "%ROOT%client" cmd /k "npx expo start --web"

echo.
echo ============================================
echo   NexusFlow is starting in two windows.
echo.
echo   Backend  (local API):  http://localhost:4000
echo   Frontend (web):  http://localhost:8081
echo.
echo   The web app opens in your browser automatically.
echo   If it doesn't, Ctrl+click the frontend link above.
echo ============================================
echo.
pause
endlocal
