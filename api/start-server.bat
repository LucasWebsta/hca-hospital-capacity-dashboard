@echo off
echo Starting HCA Census API Server...
echo.

cd /d %~dp0

echo Checking dependencies...
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo.
echo Building TypeScript...
call npm run build

echo.
echo Starting server on http://localhost:7071
echo.
call npm run dev:express

pause




