/**
 * 操作日志路由
 * 处理操作日志的查询
 */

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');
const { success, error, paginate } = require('../utils/response');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * GET /api/logs
 * 获取操作日志列表
 * 组长看本组、主任/管理员看全部
 */
router.get('/', (req, res) => {
  const db = getDb();
  const { page = 1, pageSize = 50, operation_type, target_type, user_id, start_date, end_date } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let whereClause = 'WHERE 1=1';
  const params = [];

  // 按角色过滤
  if (req.user.role === 'MEMBER') {
    // 组成员只能看自己的日志
    whereClause += ' AND l.user_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'LEADER') {
    // 组长看本组所有用户的日志
    whereClause += ' AND u.group_id = ?';
    params.push(req.user.group_id);
  }
  // DIRECTOR和ADMIN看全部

  // 筛选条件
  if (operation_type) {
    whereClause += ' AND l.operation_type = ?';
    params.push(operation_type);
  }

  if (target_type) {
    whereClause += ' AND l.target_type = ?';
    params.push(target_type);
  }

  if (user_id) {
    whereClause += ' AND l.user_id = ?';
    params.push(parseInt(user_id));
  }

  if (start_date) {
    whereClause += ' AND l.operation_time >= ?';
    params.push(start_date);
  }

  if (end_date) {
    whereClause += ' AND l.operation_time <= ?';
    params.push(end_date + ' 23:59:59');
  }

  const countResult = db.prepare(`
    SELECT COUNT(*) as total
    FROM sys_operation_log l
    LEFT JOIN sys_user u ON l.user_id = u.id
    ${whereClause}
  `).get(...params);

  const logs = db.prepare(`
    SELECT l.*, u.real_name as user_real_name, u.username as user_username, u.group_id
    FROM sys_operation_log l
    LEFT JOIN sys_user u ON l.user_id = u.id
    ${whereClause}
    ORDER BY l.operation_time DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  // 解析JSON字段
  logs.forEach(log => {
    if (log.before_data) {
      try {
        log.before_data = JSON.parse(log.before_data);
      } catch (e) {
        // 解析失败，保持原值
      }
    }
    if (log.after_data) {
      try {
        log.after_data = JSON.parse(log.after_data);
      } catch (e) {
        // 解析失败，保持原值
      }
    }
  });

  return res.json({
    code: 200,
    message: 'success',
    data: {
      list: logs,
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
 * GET /api/logs/stats/summary
 * 获取操作统计（必须在/:id之前注册，否则会被:id参数拦截）
 */
router.get('/stats/summary', requireRole('LEADER', 'DIRECTOR', 'ADMIN'), (req, res) => {
  const db = getDb();
  const { start_date, end_date } = req.query;

  let dateFilter = '';
  const params = [];

  if (start_date) {
    dateFilter += ' AND operation_time >= ?';
    params.push(start_date);
  }
  if (end_date) {
    dateFilter += ' AND operation_time <= ?';
    params.push(end_date + ' 23:59:59');
  }

  // 按操作类型统计
  const byType = db.prepare(`
    SELECT operation_type, COUNT(*) as count
    FROM sys_operation_log
    WHERE 1=1 ${dateFilter}
    GROUP BY operation_type
  `).all(...params);

  // 按用户统计
  let userFilter = '';
  if (req.user.role === 'LEADER') {
    userFilter = ' AND u.group_id = ?';
    params.push(req.user.group_id);
  }

  const byUser = db.prepare(`
    SELECT l.user_id, u.real_name, COUNT(*) as count
    FROM sys_operation_log l
    LEFT JOIN sys_user u ON l.user_id = u.id
    WHERE 1=1 ${dateFilter} ${userFilter}
    GROUP BY l.user_id
    ORDER BY count DESC
    LIMIT 10
  `).all(...params);

  // 今日操作数
  const today = new Date().toISOString().split('T')[0];
  const todayCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM sys_operation_log
    WHERE operation_time >= ?
  `).get(today + ' 00:00:00');

  return success(res, {
    by_type: byType,
    by_user: byUser,
    today_count: todayCount.count
  });
});

/**
 * GET /api/logs/:id
 * 获取日志详情
 */
router.get('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const log = db.prepare(`
    SELECT l.*, u.real_name as user_real_name, u.username as user_username, u.group_id
    FROM sys_operation_log l
    LEFT JOIN sys_user u ON l.user_id = u.id
    WHERE l.id = ?
  `).get(id);

  if (!log) {
    return error(res, 404, '日志不存在');
  }

  // 解析JSON字段
  if (log.before_data) {
    try {
      log.before_data = JSON.parse(log.before_data);
    } catch (e) {}
  }
  if (log.after_data) {
    try {
      log.after_data = JSON.parse(log.after_data);
    } catch (e) {}
  }

  return success(res, log);
});

module.exports = router;
