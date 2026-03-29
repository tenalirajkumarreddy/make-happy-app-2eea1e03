@echo off
echo ================================
echo APK Complete Rebuild Script
echo ================================
echo.
echo This will:
echo 1. Clean old builds
echo 2. Build the web app with TypeScript check
echo 3. Sync to Android project
echo 4. Build a fresh Debug APK
echo.

echo Step 1: Clean old builds...
if exist dist rmdir /s /q dist
if exist android\app\build rmdir /s /q android\app\build
echo Clean complete.
echo.

echo Step 2: Building web app...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo ================================
    echo ERROR: Build failed!
    echo ================================
    echo There are TypeScript or build errors.
    echo Please fix them and try again.
    echo.
    pause
    exit /b %errorlevel%
)
echo Build complete.
echo.

echo Step 3: Syncing to Android...
call npx cap sync android
if %errorlevel% neq 0 (
    echo.
    echo ================================
    echo ERROR: Capacitor sync failed!
    echo ================================
    echo.
    pause
    exit /b %errorlevel%
)
echo Sync complete.
echo.

echo Step 4: Building Debug APK...
cd android
call gradlew.bat clean assembleDebug
if %errorlevel% neq 0 (
    echo.
    echo ================================
    echo ERROR: APK build failed!
    echo ================================
    cd ..
    pause
    exit /b %errorlevel%
)
cd ..
echo APK build complete!
echo.

echo ================================
echo SUCCESS!
echo ================================
echo.
echo APK location: android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo IMPORTANT:
echo - Uninstall the old app from your device first
echo - Then install this new APK
echo - The 404 error should now be fixed!
echo.
pause
