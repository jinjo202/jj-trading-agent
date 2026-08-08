@echo off
REM Task Scheduler entry point for the daily pipeline.
REM
REM ASCII ONLY. cmd.exe reads .cmd files in the system ANSI codepage (CP949 on
REM Korean Windows), not UTF-8. Korean comments here turned into mojibake that
REM broke command parsing, and the scheduled run died with 9009 before it could
REM even create the log directory. Keep every byte in this file ASCII.

REM Task Scheduler does not guarantee a working directory, so derive it.
cd /d "%~dp0.."

REM Locale-independent date. Parsing %DATE% depends on regional format.
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%i

if not exist logs mkdir logs

REM --publish makes a successful run go live on the site immediately.
REM Remove " -- --publish" to keep the human review gate.
call npm run daily -- --publish >> "logs\daily-%TODAY%.log" 2>&1
set RC=%ERRORLEVEL%
echo [%DATE% %TIME%] exit=%RC% >> "logs\daily-%TODAY%.log"
exit /b %RC%
