@echo off
REM Task Scheduler entry point for the daily pipeline.
REM
REM ASCII ONLY. cmd.exe reads .cmd files in the system ANSI codepage (CP949 on
REM Korean Windows), not UTF-8. Korean comments here turned into mojibake that
REM broke command parsing, and the scheduled run died with 9009 before it could
REM even create the log directory. Keep every byte in this file ASCII.

REM Task Scheduler does not guarantee a working directory, so derive it.
cd /d "%~dp0.."

REM Unlisted ntfy.sh topic for failure alerts. Not a secret, just obscure --
REM anyone who guesses it could see run logs, so don't publish it elsewhere.
set NTFY_TOPIC=jj-trading-agent-0f163934ef

REM Locale-independent date. Parsing %DATE% depends on regional format.
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%i

if not exist logs mkdir logs

REM --publish makes a successful run go live on the site immediately.
REM Remove " -- --publish" to keep the human review gate.
call npm run daily -- --publish >> "logs\daily-%TODAY%.log" 2>&1
set RC=%ERRORLEVEL%
echo [%DATE% %TIME%] exit=%RC% >> "logs\daily-%TODAY%.log"

REM Fire an alert on any failure. This runs regardless of WHERE it broke
REM (OAuth expiry inside node, npm itself missing, whatever) because it
REM only looks at the exit code, not at daily.ts's own try/catch.
REM Keyless push via ntfy.sh -- no account, no API key. Subscribe to the
REM topic in the ntfy app or at https://ntfy.sh/<topic> to get pinged.
REM Kept in a separate .ps1 (notify-failure.ps1) -- cmd.exe's `if ( ... )`
REM block parser breaks on parentheses even inside quoted PowerShell code.
if not "%RC%"=="0" call :alert

exit /b %RC%

:alert
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0notify-failure.ps1" -LogPath "logs\daily-%TODAY%.log" -Topic "%NTFY_TOPIC%" -Title "jj-trading-agent %TODAY% failed"
goto :eof
