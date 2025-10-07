@echo off
setlocal

echo ===================================
echo   Building Photorium Executable
echo ===================================

set "BUILD_DIR=build_temp"

echo Activating virtual environment...
call .\.venv\Scripts\activate

echo Running PyInstaller...
pyinstaller --name Photorium --onefile --windowed --distpath %BUILD_DIR% --add-data "templates;templates" --add-data "static;static" gui.py

if %errorlevel% neq 0 (
    echo.
    echo PyInstaller failed!
    pause
    exit /b %errorlevel%
)

echo.
echo Moving executable to root directory...
move /Y "%BUILD_DIR%\Photorium.exe" ".\Photorium.exe"

echo.
echo Cleaning up build files...
rmdir /S /Q %BUILD_DIR%
rmdir /S /Q build
del Photorium.spec

echo.
echo Build successful! The executable can be found in the 'dist' folder.
echo Build successful! Photorium.exe has been created in the current directory.
endlocal