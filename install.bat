@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Node.js not found. Downloading and installing Node.js LTS...
    powershell -Command "Start-BitsTransfer -Source https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi -Destination nodejs-lts.msi"
    msiexec /i nodejs-lts.msi /qn
    del nodejs-lts.msi
    where node >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        echo Node.js installation failed. Please install manually from https://nodejs.org/
        pause
        exit /b 1
    )
    echo Node.js installed successfully.
) else (
    echo Node.js is already installed.
)

REM Install npm dependencies
if exist package.json (
    echo Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo npm install failed. Please check your internet connection or package.json.
        pause
        exit /b 1
    )
) else (
    echo package.json not found. Please run this script in the project root folder.
    pause
    exit /b 1
)

REM Start the Electron app
if exist node_modules (
    echo Starting the Cyberpunk 2077 Modding Toolkit...
    call npm start
) else (
    echo node_modules folder not found. Something went wrong with npm install.
    pause
    exit /b 1
)

endlocal
pause 