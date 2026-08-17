@echo off
REM Task Scheduler entry point for the monthly asset-allocation report.
REM
REM ASCII ONLY. cmd.exe reads .cmd files in the system ANSI codepage (CP949 on
REM Korean Windows), not UTF-8. See scripts/daily.cmd for the incident this rule
REM came from. Keep every byte in this file ASCII.

cd /d "%~dp0.."

set NTFY_TOPIC=jj-trading-agent-0f163934ef

REM This task fires DAILY but only does work once per month. Reason: PowerShell's
REM New-ScheduledTaskTrigger has no monthly option, and schtasks /Create mangles
REM the repo path at the space in "trading agent". So instead of a monthly
REM trigger we wake daily and let --if-missing decide. That also self-heals: if
REM the PC was off on the 1st, the next boot still produces the report.
REM
REM Target is LAST month, not this one -- a month's report needs the month to be
REM over. On 2026-09-01 this generates 2026-08.
for /f %%i in ('powershell -NoProfile -Command "(Get-Date).AddMonths(-1).ToString('yyyy-MM')"') do set TARGET=%%i
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%i

if not exist logs mkdir logs

call npm run monthly -- %TARGET% --publish --if-missing >> "logs\monthly-%TODAY%.log" 2>&1
set RC=%ERRORLEVEL%
echo [%DATE% %TIME%] target=%TARGET% exit=%RC% >> "logs\monthly-%TODAY%.log"

if not "%RC%"=="0" call :alert

exit /b %RC%

:alert
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0notify-failure.ps1" -LogPath "logs\monthly-%TODAY%.log" -Topic "%NTFY_TOPIC%" -Title "jj-trading-agent monthly %TARGET% failed"
goto :eof
