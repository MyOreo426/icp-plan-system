@echo off
chcp 65001 >nul
echo ========================================
echo   内控计划系统 - 一键启动脚本
echo ========================================
echo.

cd /d "%~dp0"

:: 检查 Node.js 是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/3] 检查依赖...
if not exist "node_modules" (
    echo 正在安装依赖...
    npm install --production
)

echo [2/3] 安装 pm2 进程管理器...
npm list -g pm2 >nul 2>&1
if %errorlevel% neq 0 (
    npm install -g pm2
)

echo [3/3] 启动服务...
if exist "ecosystem.config.js" (
    pm2 start ecosystem.config.js
) else (
    pm2 start server.js --name icp-system
)

echo.
echo ========================================
echo   服务启动成功！
echo   访问地址: http://localhost:3000
echo   查看状态: pm2 status
echo   查看日志: pm2 logs icp-system
echo ========================================
echo.

:: 设置开机自启
echo 是否设置开机自启？(Y/N)
set /p choice=
if /i "%choice%"=="Y" (
    pm2 save
    pm2 startup
    echo 已设置开机自启
)

pause
