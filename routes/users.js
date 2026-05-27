/**
 * 用户管理路由
 * 处理用户的CRUD操作
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');
const { success, error } = require('../utils/response');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * GET /api/users
 * 获取用户列表（管理员和主任）
 */
router.get('/', requireRole('ADMIN', 'DIRECTOR'), (req, res) => {
  const db = getDb();
  const { page = 1, pageSize = 50, role, group_id, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (role) {
    whereClause += ' AND u.role = ?';
    params.push(role);
  }
  if (group_id) {
    whereClause += ' AND u.group_id = ?';
    params.push(group_id);
  }
  if (status !== undefined) {
    whereClause += ' AND u.status = ?';
    params.push(parseInt(status));
  }

  const countResult = db.prepare(`
    SELECT COUNT(*) as total FROM sys_user u ${whereClause}
  `).get(...params);

  const users = db.prepare(`
    SELECT u.*, g.group_name
    FROM sys_user u
    LEFT JOIN sys_group g ON u.group_id = g.id
    ${whereClause}
    ORDER BY u.create_time DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  // 脱敏处理：隐藏密码
  users.forEach(user => {
    delete user.password;
  });

  return res.json({
    code: 200,
    message: 'success',
    data: {
      list: users,
      pagination: {
        total: countResult.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(countResult.total / parseInt(pageSize))
      }
    }
  });
});

/**
 * GET /api/users/:id
 * 获取用户详情
 */
router.get('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  // 只能查看自己或者管理员可以查看所有
  if (req.user.role !== 'ADMIN' && req.user.id !== parseInt(id)) {
    return error(res, 403, '无权查看此用户');
  }

  const user = db.prepare(`
    SELECT u.*, g.group_name
    FROM sys_user u
    LEFT JOIN sys_group g ON u.group_id = g.id
    WHERE u.id = ?
  `).get(id);

  if (!user) {
    return error(res, 404, '用户不存在');
  }

  delete user.password;

  return success(res, user);
});

/**
 * POST /api/users
 * 创建用户（仅管理员）
 * 创建组长时同步创建小组
 */
router.post('/', requireRole('ADMIN'), (req, res) => {
  const db = getDb();
  const {
    username, real_name, email, phone, role,
    group_id, password = '123456' // 默认密码
  } = req.body;

  // 参数验证
  if (!username || !real_name || !role) {
    return error(res, 400, '工号、姓名和角色不能为空');
  }

  // 验证工号格式（6位数字）
  if (!/^\d{6}$/.test(username)) {
    return error(res, 400, '工号必须为6位数字');
  }

  // 检查工号是否已存在
  const existingUser = db.prepare('SELECT id FROM sys_user WHERE username = ?').get(username);
  if (existingUser) {
    return error(res, 400, '工号已存在');
  }

  // 验证邮箱唯一性
  if (email) {
    const existingEmail = db.prepare('SELECT id FROM sys_user WHERE email = ?').get(email);
    if (existingEmail) {
      return error(res, 400, '邮箱已被使用');
    }
  }

  // 验证角色
  const validRoles = ['MEMBER', 'LEADER', 'DIRECTOR', 'ADMIN'];
  if (!validRoles.includes(role)) {
    return error(res, 400, '角色无效');
  }

  // 组长必须关联小组或创建新小组
  let finalGroupId = group_id;
  if (role === 'LEADER' && !group_id) {
    // 创建新小组，组名默认"[姓名]组"
    const defaultGroupName = `${real_name}组`;
    const groupResult = db.prepare(`
      INSERT INTO sys_group (group_name, status)
      VALUES (?, 1)
    `).run(defaultGroupName);
    finalGroupId = groupResult.lastInsertRowid;
  }

  // 验证小组是否存在
  if (finalGroupId) {
    const group = db.prepare('SELECT * FROM sys_group WHERE id = ?').get(finalGroupId);
    if (!group) {
      return error(res, 400, '小组不存在');
    }
    // 检查组长是否已分配
    if (role === 'LEADER' && group.leader_id) {
      return error(res, 400, '该小组已有组长');
    }
  }

  // 加密密码
  const hashedPassword = bcrypt.hashSync(password, 10);

  // 创建用户
  const result = db.prepare(`
    INSERT INTO sys_user (
      username, password, real_name, email, phone, role,
      group_id, status, must_change_password
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
  `).run(username, hashedPassword, real_name, email || null, phone || null, role, finalGroupId || null);

  // 如果是组长，更新小组的leader_id
  if (role === 'LEADER' && finalGroupId) {
    db.prepare('UPDATE sys_group SET leader_id = ? WHERE id = ?').run(result.lastInsertRowid, finalGroupId);
  }

  const newUser = db.prepare(`
    SELECT u.*, g.group_name
    FROM sys_user u
    LEFT JOIN sys_group g ON u.group_id = g.id
    WHERE u.id = ?
  `).get(result.lastInsertRowid);

  delete newUser.password;

  return success(res, newUser, '用户创建成功');
});

/**
 * PUT /api/users/:id
 * 更新用户信息
 */
router.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { real_name, email, phone, role, group_id } = req.body;

  // 只能修改自己或者管理员可以修改所有
  if (req.user.role !== 'ADMIN' && req.user.id !== parseInt(id)) {
    return error(res, 403, '无权修改此用户');
  }

  const user = db.prepare('SELECT * FROM sys_user WHERE id = ?').get(id);
  if (!user) {
    return error(res, 404, '用户不存在');
  }

  // 非管理员不能修改角色
  if (role && req.user.role !== 'ADMIN') {
    return error(res, 403, '无权修改用户角色');
  }

  // 构建更新字段
  const updateFields = [];
  const params = [];

  if (real_name !== undefined) {
    updateFields.push('real_name = ?');
    params.push(real_name);
  }
  if (email !== undefined) {
    if (email) {
      const existingEmail = db.prepare('SELECT id FROM sys_user WHERE email = ? AND id != ?').get(email, id);
      if (existingEmail) {
        return error(res, 400, '邮箱已被使用');
      }
    }
    updateFields.push('email = ?');
    params.push(email || null);
  }
  if (phone !== undefined) {
    updateFields.push('phone = ?');
    params.push(phone || null);
  }
  if (role !== undefined && req.user.role === 'ADMIN') {
    updateFields.push('role = ?');
    params.push(role);
  }
  if (group_id !== undefined && req.user.role === 'ADMIN') {
    // 如果切换小组，需要检查新小组是否存在且没有组长（如果是组长角色）
    if (group_id) {
      const newGroup = db.prepare('SELECT * FROM sys_group WHERE id = ?').get(group_id);
      if (!newGroup) {
        return error(res, 400, '小组不存在');
      }
      if (role === 'LEADER' && newGroup.leader_id && newGroup.leader_id !== parseInt(id)) {
        return error(res, 400, '该小组已有组长');
      }
    }
    updateFields.push('group_id = ?');
    params.push(group_id || null);
  }

  if (updateFields.length === 0) {
    return error(res, 400, '没有要更新的字段');
  }

  updateFields.push("update_time = datetime('now')");
  params.push(id);

  db.prepare(`UPDATE sys_user SET ${updateFields.join(', ')} WHERE id = ?`).run(...params);

  const updatedUser = db.prepare(`
    SELECT u.*, g.group_name
    FROM sys_user u
    LEFT JOIN sys_group g ON u.group_id = g.id
    WHERE u.id = ?
  `).get(id);

  delete updatedUser.password;

  return success(res, updatedUser, '用户更新成功');
});

/**
 * PUT /api/users/:id/password/reset
 * 重置用户密码（仅管理员）
 */
router.put('/:id/password/reset', requireRole('ADMIN'), (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const user = db.prepare('SELECT * FROM sys_user WHERE id = ?').get(id);
  if (!user) {
    return error(res, 404, '用户不存在');
  }

  // 重置密码为123456
  const hashedPassword = bcrypt.hashSync('123456', 10);
  db.prepare(`
    UPDATE sys_user 
    SET password = ?, must_change_password = 1, update_time = datetime('now')
    WHERE id = ?
  `).run(hashedPassword, id);

  return success(res, { must_change_password: true }, '密码已重置为123456，请通知用户首次登录后修改');
});

/**
 * PUT /api/users/:id/disable
 * 禁用用户（仅管理员）
 * 禁用后：该用户创建的计划responsible_id置空，计划对所有用户可见
 */
router.put('/:id/disable', requireRole('ADMIN'), (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const user = db.prepare('SELECT * FROM sys_user WHERE id = ?').get(id);
  if (!user) {
    return error(res, 404, '用户不存在');
  }

  if (user.status === 0) {
    return error(res, 400, '用户已被禁用');
  }

  // 禁用用户
  db.prepare(`
    UPDATE sys_user SET status = 0, update_time = datetime('now') WHERE id = ?
  `).run(id);

  // 将该用户创建的计划责任人置空
  const affectedPlans = db.prepare(`
    UPDATE icp_plan SET responsible_id = NULL, update_time = datetime('now')
    WHERE creator_id = ? AND is_deleted = 0
  `).run(id);

  // 将该用户负责的计划责任人置空
  db.prepare(`
    UPDATE icp_plan SET responsible_id = NULL, update_time = datetime('now')
    WHERE responsible_id = ? AND is_deleted = 0
  `).run(id);

  return success(res, { 
    user_id: parseInt(id),
    affected_plans: affectedPlans.changes
  }, '用户已禁用，相关计划责任人已置空');
});

/**
 * PUT /api/users/:id/enable
 * 启用用户（仅管理员）
 */
router.put('/:id/enable', requireRole('ADMIN'), (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const user = db.prepare('SELECT * FROM sys_user WHERE id = ?').get(id);
  if (!user) {
    return error(res, 404, '用户不存在');
  }

  if (user.status === 1) {
    return error(res, 400, '用户已是启用状态');
  }

  db.prepare(`
    UPDATE sys_user SET status = 1, update_time = datetime('now') WHERE id = ?
  `).run(id);

  return success(res, null, '用户已启用');
});

module.exports = router;
