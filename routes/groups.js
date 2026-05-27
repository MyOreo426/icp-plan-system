/**
 * 小组路由
 * 处理小组的查询和创建
 */

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');
const { success, error, paginate } = require('../utils/response');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * GET /api/groups
 * 获取小组列表
 * 管理员看全部，其他人看本组
 */
router.get('/', (req, res) => {
  const db = getDb();

  let groups;
  if (req.user.role === 'ADMIN') {
    // 管理员查看所有小组
    groups = db.prepare(`
      SELECT g.*, u.real_name as leader_name, u.username as leader_username,
        (SELECT COUNT(*) FROM sys_user WHERE group_id = g.id AND status = 1) as member_count
      FROM sys_group g
      LEFT JOIN sys_user u ON g.leader_id = u.id
      WHERE g.status = 1
      ORDER BY g.create_time DESC
    `).all();
  } else {
    // 其他人只查看本组
    groups = db.prepare(`
      SELECT g.*, u.real_name as leader_name, u.username as leader_username,
        (SELECT COUNT(*) FROM sys_user WHERE group_id = g.id AND status = 1) as member_count
      FROM sys_group g
      LEFT JOIN sys_user u ON g.leader_id = u.id
      WHERE g.id = ? AND g.status = 1
    `).all(req.user.group_id);
  }

  return success(res, groups);
});

/**
 * GET /api/groups/:id
 * 获取小组详情
 */
router.get('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const group = db.prepare(`
    SELECT g.*, u.real_name as leader_name, u.username as leader_username
    FROM sys_group g
    LEFT JOIN sys_user u ON g.leader_id = u.id
    WHERE g.id = ?
  `).get(id);

  if (!group) {
    return error(res, 404, '小组不存在');
  }

  // 权限检查
  if (req.user.role !== 'ADMIN' && group.id !== req.user.group_id) {
    return error(res, 403, '无权查看此小组');
  }

  // 获取小组成员
  const members = db.prepare(`
    SELECT id, username, real_name, email, phone, role, status, must_change_password
    FROM sys_user
    WHERE group_id = ? AND status = 1
    ORDER BY role, create_time
  `).all(id);

  return success(res, { ...group, members });
});

/**
 * POST /api/groups
 * 创建小组（仅管理员）
 */
router.post('/', requireRole('ADMIN'), (req, res) => {
  const db = getDb();
  const { group_name, department, leader_id } = req.body;

  if (!group_name) {
    return error(res, 400, '小组名称不能为空');
  }

  // 检查组长是否存在且角色为LEADER
  if (leader_id) {
    const leader = db.prepare('SELECT * FROM sys_user WHERE id = ?').get(leader_id);
    if (!leader) {
      return error(res, 400, '组长不存在');
    }
    if (leader.role !== 'LEADER') {
      return error(res, 400, '指定的组长角色不正确');
    }
    if (leader.group_id) {
      return error(res, 400, '该用户已属于其他小组');
    }
  }

  // 创建小组
  const result = db.prepare(`
    INSERT INTO sys_group (group_name, department, leader_id, status)
    VALUES (?, ?, ?, 1)
  `).run(group_name, department || null, leader_id || null);

  // 如果指定了组长，更新用户的小组
  if (leader_id) {
    db.prepare(`
      UPDATE sys_user SET group_id = ?, update_time = datetime('now')
      WHERE id = ?
    `).run(result.lastInsertRowid, leader_id);
  }

  const newGroup = db.prepare('SELECT * FROM sys_group WHERE id = ?').get(result.lastInsertRowid);

  return success(res, newGroup, '小组创建成功');
});

/**
 * PUT /api/groups/:id
 * 更新小组信息（仅管理员）
 */
router.put('/:id', requireRole('ADMIN'), (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { group_name, department, leader_id } = req.body;

  const group = db.prepare('SELECT * FROM sys_group WHERE id = ?').get(id);
  if (!group) {
    return error(res, 404, '小组不存在');
  }

  // 构建更新字段
  const updateFields = [];
  const params = [];

  if (group_name !== undefined) {
    updateFields.push('group_name = ?');
    params.push(group_name);
  }
  if (department !== undefined) {
    updateFields.push('department = ?');
    params.push(department);
  }
  if (leader_id !== undefined) {
    if (leader_id) {
      const leader = db.prepare('SELECT * FROM sys_user WHERE id = ?').get(leader_id);
      if (!leader) {
        return error(res, 400, '组长不存在');
      }
      if (leader.role !== 'LEADER') {
        return error(res, 400, '指定的组长角色不正确');
      }
    }
    updateFields.push('leader_id = ?');
    params.push(leader_id);
  }

  if (updateFields.length === 0) {
    return error(res, 400, '没有要更新的字段');
  }

  params.push(id);
  db.prepare(`UPDATE sys_group SET ${updateFields.join(', ')} WHERE id = ?`).run(...params);

  // 如果更换了组长，更新相关用户的group_id
  if (leader_id !== undefined && leader_id !== group.leader_id) {
    // 解除原组长的group_id
    if (group.leader_id) {
      db.prepare('UPDATE sys_user SET group_id = NULL WHERE id = ?').run(group.leader_id);
    }
    // 设置新组长的group_id
    if (leader_id) {
      db.prepare('UPDATE sys_user SET group_id = ? WHERE id = ?').run(id, leader_id);
    }
  }

  const updatedGroup = db.prepare(`
    SELECT g.*, u.real_name as leader_name
    FROM sys_group g
    LEFT JOIN sys_user u ON g.leader_id = u.id
    WHERE g.id = ?
  `).get(id);

  return success(res, updatedGroup, '小组更新成功');
});

module.exports = router;
