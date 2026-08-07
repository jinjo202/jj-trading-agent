@echo off
REM 작업 스케줄러가 부르는 진입점.
REM 스케줄러는 cwd를 보장하지 않으므로 스크립트 위치 기준으로 리포지토리 루트로 이동한다.
cd /d "%~dp0.."

REM 로그는 날짜별로 남긴다. 무인 실행이 조용히 실패하면 이 파일이 유일한 단서다.
if not exist logs mkdir logs
for /f "tokens=1-3 delims=/- " %%a in ("%DATE%") do set TODAY=%%a-%%b-%%c

REM --publish 는 실행 성공 시 사이트에 바로 공개한다.
REM 사람 검토 후 공개하고 싶으면 이 줄에서 " -- --publish" 를 지우면 된다.
call npm run daily -- --publish >> "logs\daily-%TODAY%.log" 2>&1
set RC=%ERRORLEVEL%
echo [%DATE% %TIME%] exit=%RC% >> "logs\daily-%TODAY%.log"
exit /b %RC%
