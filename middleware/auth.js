/**
 * JWT认证中间件
 * 提供Token验证和角色权限控制功能
 */

const jwt = require('jsonwebtoken');
const { getDb } = require('../db/init');
const { error } = require('../utils/response');

// JWT密钥（生产环境应从环境变量读取）
const JWT_SECRET = process.env.JWT_SECRET || 'icp-system-secret-key-2024';
const JWT_EXPIRES_IN = '7d'; // Token有效期7天

// 登录失败锁定配置
const MAX_LOGIN_ATTEMPTS = 5;  // 最大失败次数
const LOCK_DURATION = 3 * 60 * 1000; // 锁定时长3分钟

/**
 * 生成JWT Token
 * @param {Object} user - 用户对象
 * @returns {string} JWT Token
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      group_id: user.group_id
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * JWT认证中间件
 * 验证请求头中的Token
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 401, '未提供认证令牌');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 从数据库获取最新用户信息
    const db = getDb();
    const user = db.prepare('SELECT * FROM sys_user WHERE id = ? AND status = 1').get(decoded.id);
    
    if (!user) {
      return error(res, 401, '用户不存在或已被禁用');
    }

    // 将用户信息注入req对象
    req.user = {
      id: user.id,
      username: user.username,
      real_name: user.real_name,
      role: user.role,
      group_id: user.group_id
    };
    
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 401, '令牌已过期');
    }
    return error(res, 401, '无效的认证令牌');
  }
}

/**
 * 角色权限中间件工厂
 * @param {...string} allowedRoles - 允许的角色列表
 * @returns {Function} Express中间件
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 401, '未认证');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return error(res, 403, '权限不足');
    }

    next();
  };
}

/**
 * 检查登录锁定状态
 * @param {string} username - 工号
 * @returns {Object} { locked: boolean, lockUntil: Date|null }
 */
function checkLoginLock(username) {
  const db = getDb();
  const now = new Date();
  const attempt = db.prepare(`
    SELECT * FROM sys_login_attempt 
    WHERE username = ?
  `).get(username);

  if (attempt && attempt.lock_until) {
    // SQLite存储的是UTC时间字符串，需要解析为UTC时间再比较
    const lockUntilUtc = new Date(attempt.lock_until + 'Z'); // 标记为UTC时间
    if (lockUntilUtc > now) {
      return {
        locked: true,
        lockUntil: lockUntilUtc
      };
    }
  }

  return { locked: false, lockUntil: null };
}

/**
 * 记录登录失败
 * @param {string} username - 工号
 */
function recordLoginFailure(username) {
  const db = getDb();
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOCK_DURATION);
  // 转换为ISO字符串并去掉Z后缀，与SQLite datetime格式一致（存储UTC时间）
  const lockUntilStr = lockUntil.toISOString().replace('Z', '');
  const nowStr = now.toISOString().replace('Z', '');

  const existing = db.prepare('SELECT * FROM sys_login_attempt WHERE username = ?').get(username);

  if (existing) {
    const newAttempts = existing.attempt_count + 1;
    
    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      // 锁定账户
      db.prepare(`
        UPDATE sys_login_attempt 
        SET attempt_count = ?, lock_until = ?, last_attempt = ?
        WHERE username = ?
      `).run(newAttempts, lockUntilStr, nowStr, username);
    } else {
      db.prepare(`
        UPDATE sys_login_attempt 
        SET attempt_count = ?, last_attempt = ?
        WHERE username = ?
      `).run(newAttempts, nowStr, username);
    }
  } else {
    db.prepare(`
      INSERT INTO sys_login_attempt (username, attempt_count, lock_until, last_attempt)
      VALUES (?, 1, ?, ?)
    `).run(username, lockUntilStr, nowStr);
  }
}

/**
 * 清除登录失败记录
 * @param {string} username - 工号
 */
function clearLoginFailure(username) {
  const db = getDb();
  db.prepare('DELETE FROM sys_login_attempt WHERE username = ?').run(username);
}

module.exports = {
  generateToken,
  authenticate,
  requireRole,
  checkLoginLock,
  recordLoginFailure,
  clearLoginFailure,
  JWT_SECRET
};
