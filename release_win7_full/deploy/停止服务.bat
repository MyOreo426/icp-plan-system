@echo off
chcp 65001 >nul
echo ========================================
echo   停止 ICP 系统服务
echo ========================================
echo.

pm2 stop icp-system
pm2 delete icp-system

echo.
echo 服务已停止
pause
