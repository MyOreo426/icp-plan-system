@echo off
chcp 65001 >nul

:: 配置项
set SOURCE_DB=data\icp.db
set BACKUP_DIR=backup
set KEEP_DAYS=30

cd /d "%~dp0"

if not exist "%SOURCE_DB%" (
    echo [错误] 数据库文件不存在: %SOURCE_DB%
    exit /b 1
)

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:: 生成时间戳文件名
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set dt=%%a
set TIMESTAMP=%dt:~0,4%-%dt:~4,2%-%dt:~6,2%_%dt:~8,2%-%dt:~10,2%-%dt:~12,2%

:: 备份
copy "%SOURCE_DB%" "%BACKUP_DIR%\icp_%TIMESTAMP%.db" >nul
echo [成功] 已备份: icp_%TIMESTAMP%.db

:: 清理30天前的旧备份
forfiles /p "%BACKUP_DIR%" /m *.db /d -%KEEP_DAYS% /c "cmd /c del @path" 2>nul

exit /b 0
