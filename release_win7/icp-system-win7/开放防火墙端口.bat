@echo off
chcp 65001 >nul
echo ========================================
echo   开放防火墙 3000 端口
echo ========================================
echo.

:: 检查是否以管理员身份运行
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 请右键选择"以管理员身份运行"此脚本
    pause
    exit /b 1
)

:: 添加入站规则
netsh advfirewall firewall add rule name="ICP系统-3000端口" dir=in action=allow protocol=TCP localport=3000

echo.
echo ========================================
echo   端口已开放！
echo   其他人可通过 http://你的IP:3000 访问
echo ========================================
echo.

:: 显示本机IP
echo 你的内网IP地址：
ipconfig | findstr /i "IPv4"
echo.

pause
