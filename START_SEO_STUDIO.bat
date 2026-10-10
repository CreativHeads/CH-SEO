@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22.5 or later from https://nodejs.org then run this file again.
 pause
 exit /b 1
)
node -e "if((([a,b])=>a<22||(a===22&&b<5))(process.versions.node.split('.').map(Number)))process.exit(1)"
if errorlevel 1 (
 echo Node.js 22.5 or later is required. Update Node.js and try again.
 pause
 exit /b 1
)
if not exist node_modules (
 echo Installing SEO Studio dependencies. Internet access is required for this first setup.
 call npm ci
 if errorlevel 1 goto failed
)
echo Preparing SEO Studio...
call npm run build
if errorlevel 1 goto failed
set STUDIO_OPEN_BROWSER=1
call npm run dev
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo Setup could not finish. Read the error above and keep your .local folder safe.
pause
exit /b 1
