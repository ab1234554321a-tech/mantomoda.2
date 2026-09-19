@echo off
REM ===========================================================================
REM  Manto Moda - Claude Skills installer for Windows
REM  Double-click this file. That's it.
REM
REM  What it does: copies the 69 project skills that are already inside this
REM  repo (.claude\skills) into your personal Claude folder (%USERPROFILE%\.claude\skills)
REM  so Claude Code can use them in every project on this PC.
REM ===========================================================================
setlocal enabledelayedexpansion
chcp 65001 >nul

set "SRC=%~dp0.claude\skills"
set "DST=%USERPROFILE%\.claude\skills"

echo.
echo  ============================================
echo   Manto Moda - Claude Skills Installer
echo  ============================================
echo.

if not exist "%SRC%" (
  echo  [X] Could not find skills folder: %SRC%
  echo      Make sure you are running this file from inside the mantomoda folder.
  echo.
  pause
  exit /b 1
)

if not exist "%DST%" mkdir "%DST%"

set COUNT=0
set SKIPPED=0
for /d %%D in ("%SRC%\*") do (
  if exist "%DST%\%%~nxD" (
    set /a SKIPPED+=1
  ) else (
    xcopy "%%D" "%DST%\%%~nxD\" /E /I /Q /Y >nul
    set /a COUNT+=1
  )
)

echo  [OK] Installed : %COUNT% skills
echo  [=]  Already   : %SKIPPED% skills
echo.
echo  Location: %DST%
echo.
echo  Next: restart Claude Code (or open a new terminal) and it will
echo  pick these skills up automatically in every project.
echo.
echo  Full mapping of skill -> project phase is in SKILLS.md
echo.
pause
