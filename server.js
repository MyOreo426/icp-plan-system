/**
 * 计划管理系统 - 后端服务入口
 * Node.js + Express + SQLite (sql.js)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');

// 导入数据库初始化模块
const { initDatabase, getDbReady } = require('./db/init');

// 导入路由
const authRoutes = require('./routes/auth');
const plansRoutes = require('./routes/plans');
const usersRoutes = require('./routes/users');
const groupsRoutes = require('./routes/groups');
const notificationsRoutes = require('./routes/notifications');
const logsRoutes = require('./routes/logs');

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;
console.log('PORT setting:', PORT);

// 中间件配置
// 跨域配置（生产环境限制来源域名）
const allowedOrigins = [
  'https://web-production-ecf21.up.railway.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
app.use(cors({
  origin: function(origin, callback) {
    // 允许无origin的请求（如服务端请求、Postman）
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: 来源不在白名单')); // 拒绝未授权来源
      console.warn('CORS: 未在白名单的来源:', origin);
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' })); // 解析JSON请求体，限制1MB
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // 解析URL编码，限制1MB

// API速率限制
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 60, // 每IP每分钟60次请求
  message: { code: 429, message: '请求过于频繁，请稍后再试', data: null }
});
app.use('/api/', apiLimiter);

// 登录接口更严格的限流：每IP每30秒5次
const loginLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 5,
  message: { code: 429, message: '登录尝试过于频繁，请30秒后再试', data: null }
});
app.use('/api/auth/login', loginLimiter);

// 内容安全策略（CSP）- 允许内联脚本和事件处理
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'"
  );
  next();
});

// 根路径重定向到登录页
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// 静态文件托管（前端页面）
app.use(express.static('public'));

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({
    code: 200,
    message: 'success',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
});

// API路由挂载
app.use('/api/auth', authRoutes);           // 认证路由
app.use('/api/user', authRoutes);           // 用户信息路由（兼容 /api/user/info）
app.use('/api/plans', plansRoutes);         // 计划路由
app.use('/api/users', usersRoutes);         // 用户管理路由
app.use('/api/groups', groupsRoutes);       // 小组路由
app.use('/api/notifications', notificationsRoutes); // 消息通知路由
app.use('/api/logs', logsRoutes);           // 操作日志路由

// 404处理
app.use((req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
    data: null
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    data: null
  });
});

// 初始化数据库并启动服务器
async function startServer() {
  try {
    console.log('开始启动服务器...');
    
    // 等待数据库初始化完成
    await initDatabase();
    
    // 启动服务器
    app.listen(PORT, () => {
      console.log('========================================');
      console.log('  计划管理系统 - 后端服务');
      console.log('========================================');
      if (process.env.NODE_ENV !== 'production') {
        console.log('  测试账号:');
        console.log('  - 管理员: 工号 000000 / 密码 admin123');
        console.log('  - 综合计划组组长: 工号 MY / 密码 leader123');
        console.log('  - 综合计划组组员: 工号 ZZY、WMY / 密码 member123');
        console.log('  - 客户管理组组长: 工号 DH / 密码 leader123');
        console.log('  - 客户管理组组员: 工号 A1、A2、A3 / 密码 member123');
      } else {
        console.log('  运行环境: production (测试账号已隐藏)');
      }
      console.log('========================================');
      console.log(`  启动时间: ${new Date().toISOString()}`);
      console.log('========================================');
    });
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});

// 启动服务
startServer();

// 导出app用于测试
module.exports = app;
