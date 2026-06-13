/**
 * 认证路由
 * 处理登录、登出和用户信息获取
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');
const { 
  generateToken, 
  authenticate, 
  checkLoginLock, 
  recordLoginFailure, 
  clearLoginFailure 
} = require('../middleware/auth');
const { success, error } = require('../utils/response');

const router = express.Router();

/**
 * 密码强度校验
 * @param {string} password - 密码
 * @returns {Object} { valid: boolean, message: string }
 */
function validatePassword(password) {
  if (!password || password.length < 6) {
    return { valid: false, message: '密码长度不能少于6位' };
  }
  if (password.length > 20) {
    return { valid: false, message: '密码长度不能超过20位' };
  }
  // 至少包含字母和数字
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    return { valid: false, message: '密码需要同时包含字母和数字' };
  }
  // 不能是常见弱密码
  const weakPasswords = ['123456', 'password', '12345678', '123456789', '1234567', '123456a', '123456b'];
  if (weakPasswords.includes(password.toLowerCase())) {
    return { valid: false, message: '密码过于简单，请设置更复杂的密码' };
  }
  return { valid: true, message: 'ok' };
}

/**
 * POST /api/auth/login
 * 用户登录
 * 验证工号和密码，成功返回JWT Token
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';

  // 参数验证
  if (!username || !password) {
    return error(res, 400, '工号和密码不能为空');
  }

  const db = getDb();

  // 检查账户锁定状态
  const lockStatus = checkLoginLock(username);
  if (lockStatus.locked) {
    const remainingMinutes = Math.ceil((lockStatus.lockUntil - new Date()) / 60000);
    // 记录登录失败日志（锁定尝试）
    db.prepare(`
      INSERT INTO sys_operation_log (user_id, username, operation_type, target_type, ip_address, user_agent, before_data)
      VALUES (?, ?, 'LOGIN_FAILED', 'USER', ?, ?, ?)
    `).run(null, username, ip, userAgent, JSON.stringify({ reason: '账户已锁定', remaining_minutes: remainingMinutes }));
    
    return error(res, 423, `登录失败次数过多，账户已锁定，请在${remainingMinutes}分钟后重试`);
  }

  // 查询用户
  const user = db.prepare('SELECT * FROM sys_user WHERE username = ?').get(username);

  if (!user) {
    // 记录登录失败日志（用户不存在）
    db.prepare(`
      INSERT INTO sys_operation_log (user_id, username, operation_type, target_type, ip_address, user_agent, before_data)
      VALUES (?, ?, 'LOGIN_FAILED', 'USER', ?, ?, ?)
    `).run(null, username, ip, userAgent, JSON.stringify({ reason: '用户不存在' }));
    
    return error(res, 401, '工号或密码错误');
  }

  // 检查用户状态
  if (user.status === 0) {
    // 记录登录失败日志（账户禁用）
    db.prepare(`
      INSERT INTO sys_operation_log (user_id, username, operation_type, target_type, target_id, ip_address, user_agent, before_data)
      VALUES (?, ?, 'LOGIN_FAILED', 'USER', ?, ?, ?, ?)
    `).run(user.id, username, user.id, ip, userAgent, JSON.stringify({ reason: '账户已禁用' }));
    
    return error(res, 403, '账户已被禁用');
  }

  // 验证密码
  const isValidPassword = bcrypt.compareSync(password, user.password);
  if (!isValidPassword) {
    // 记录登录失败
    recordLoginFailure(username);
    
    // 记录登录失败日志（密码错误）
    db.prepare(`
      INSERT INTO sys_operation_log (user_id, username, operation_type, target_type, target_id, ip_address, user_agent, before_data)
      VALUES (?, ?, 'LOGIN_FAILED', 'USER', ?, ?, ?, ?)
    `).run(user.id, username, user.id, ip, userAgent, JSON.stringify({ reason: '密码错误' }));
    
    return error(res, 401, '工号或密码错误');
  }

  // 登录成功，清除失败记录
  clearLoginFailure(username);

  // 生成Token
  const token = generateToken(user);

  // 返回用户信息和Token
  const userInfo = {
    id: user.id,
    username: user.username,
    real_name: user.real_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    group_id: user.group_id,
    must_change_password: user.must_change_password
  };

  // 记录登录日志
  db.prepare(`
    INSERT INTO sys_operation_log (user_id, username, operation_type, target_type, target_id, ip_address, user_agent)
    VALUES (?, ?, 'LOGIN', 'USER', ?, ?, ?)
  `).run(user.id, user.username, user.id, req.ip, req.headers['user-agent'] || '');

  return success(res, { token, user: userInfo }, '登录成功');
});

/**
 * POST /api/auth/logout
 * 用户登出
 */
router.post('/logout', authenticate, (req, res) => {
  // 在生产环境中可以将Token加入黑名单
  // 这里简化为直接返回成功
  
  // 记录登出日志
  const db = getDb();
  db.prepare(`
    INSERT INTO sys_operation_log (user_id, username, operation_type, target_type, target_id, ip_address, user_agent)
    VALUES (?, ?, 'LOGOUT', 'USER', ?, ?, ?)
  `).run(req.user.id, req.user.username, req.user.id, req.ip, req.headers['user-agent'] || '');

  return success(res, null, '登出成功');
});

/**
 * GET /api/auth/user/info
 * 获取当前用户信息
 */
router.get('/info', authenticate, (req, res) => {
  const db = getDb();

  // 获取用户完整信息
  const user = db.prepare(`
    SELECT u.*, g.group_name, g.department
    FROM sys_user u
    LEFT JOIN sys_group g ON u.group_id = g.id
    WHERE u.id = ?
  `).get(req.user.id);

  if (!user) {
    return error(res, 404, '用户不存在');
  }

  // 获取用户所在小组的成员列表（用于选择责任人）
  let groupMembers = [];
  if (user.group_id) {
    groupMembers = db.prepare(`
      SELECT id, username, real_name, role 
      FROM sys_user 
      WHERE group_id = ? AND status = 1
    `).all(user.group_id);
  }

  // 获取用户创建的小组（如果是组长）
  let leaderGroups = [];
  if (user.role === 'LEADER' || user.role === 'ADMIN') {
    leaderGroups = db.prepare(`
      SELECT id, group_name, department 
      FROM sys_group 
      WHERE leader_id = ? OR (leader_id IS NULL AND ? = 'ADMIN')
    `).all(user.id, user.role);
  }

  return success(res, {
    id: user.id,
    username: user.username,
    real_name: user.real_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    group_id: user.group_id,
    group_name: user.group_name,
    department: user.department,
    status: user.status,
    must_change_password: user.must_change_password,
    create_time: user.create_time,
    groupMembers,
    leaderGroups
  });
});

/**
 * PUT /api/auth/password
 * 修改当前用户密码
 */
router.put('/password', authenticate, (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!newPassword) {
    return error(res, 400, '请提供新密码');
  }

  // 密码强度校验
  const pwdCheck = validatePassword(newPassword);
  if (!pwdCheck.valid) {
    return error(res, 400, pwdCheck.message);
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM sys_user WHERE id = ?').get(req.user.id);

  // 首次登录修改密码（must_change_password=1）时不需要验证旧密码
  // 其他情况必须验证旧密码
  if (!user.must_change_password) {
    if (!oldPassword) {
      return error(res, 400, '请提供旧密码');
    }
    if (!bcrypt.compareSync(oldPassword, user.password)) {
      return error(res, 400, '旧密码不正确');
    }
    
    // 新密码不能与旧密码相同
    if (bcrypt.compareSync(newPassword, user.password)) {
      return error(res, 400, '新密码不能与旧密码相同');
    }
  }

  // 更新密码
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare(`
    UPDATE sys_user 
    SET password = ?, must_change_password = 0, update_time = datetime('now')
    WHERE id = ?
  `).run(hashedPassword, req.user.id);

  return success(res, null, '密码修改成功');
});

module.exports = router;
