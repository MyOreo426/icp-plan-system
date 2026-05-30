/**
 * 消息通知路由
 * 处理通知的查询和已读标记
 */

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate } = require('../middleware/auth');
const { success, error, paginate } = require('../utils/response');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * GET /api/notifications
 * 获取当前用户的通知列表
 */
router.get('/', (req, res) => {
  const db = getDb();
  const { page = 1, pageSize = 50, is_read } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let whereClause = 'WHERE n.user_id = ?';
  const params = [req.user.id];

  if (is_read !== undefined) {
    whereClause += ' AND n.is_read = ?';
    params.push(parseInt(is_read));
  }

  const countResult = db.prepare(`
    SELECT COUNT(*) as total
    FROM sys_notification n
    ${whereClause}
  `).get(...params);

  const notifications = db.prepare(`
    SELECT n.*, p.action_item as plan_action_item
    FROM sys_notification n
    LEFT JOIN icp_plan p ON n.plan_id = p.id
    ${whereClause}
    ORDER BY n.create_time DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  // 获取未读数量
  const unreadCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM sys_notification
    WHERE user_id = ? AND is_read = 0
  `).get(req.user.id);

  return res.json({
    code: 200,
    message: 'success',
    data: {
      list: notifications,
      unread_count: unreadCount.count,
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
 * GET /api/notifications/unread-count
 * 获取未读通知数量
 */
router.get('/unread-count', (req, res) => {
  const db = getDb();

  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM sys_notification
    WHERE user_id = ? AND is_read = 0
  `).get(req.user.id);

  return success(res, { count: result.count });
});

/**
 * PUT /api/notifications/:id/read
 * 标记通知为已读
 */
router.put('/:id/read', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const notification = db.prepare('SELECT * FROM sys_notification WHERE id = ?').get(id);
  
  if (!notification) {
    return error(res, 404, '通知不存在');
  }

  // 只能标记自己的通知
  if (notification.user_id !== req.user.id) {
    return error(res, 403, '无权操作此通知');
  }

  if (notification.is_read === 1) {
    return success(res, null, '通知已是已读状态');
  }

  db.prepare(`
    UPDATE sys_notification SET is_read = 1 WHERE id = ?
  `).run(id);

  return success(res, null, '标记已读成功');
});

/**
 * PUT /api/notifications/read-all
 * 标记全部通知为已读
 */
router.put('/read-all', (req, res) => {
  const db = getDb();

  const result = db.prepare(`
    UPDATE sys_notification SET is_read = 1
    WHERE user_id = ? AND is_read = 0
  `).run(req.user.id);

  return success(res, { affected: result.changes }, '全部标记已读成功');
});

/**
 * DELETE /api/notifications/clean-read
 * 清理已读通知（必须在/:id之前注册，否则会被/:id参数拦截）
 */
router.delete('/clean-read', (req, res) => {
  const db = getDb();

  const result = db.prepare(`
    DELETE FROM sys_notification
    WHERE user_id = ? AND is_read = 1
  `).run(req.user.id);

  return success(res, { deleted: result.changes }, '已读通知清理成功');
});

/**
 * DELETE /api/notifications/:id
 * 删除通知
 */
router.delete('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const notification = db.prepare('SELECT * FROM sys_notification WHERE id = ?').get(id);
  
  if (!notification) {
    return error(res, 404, '通知不存在');
  }

  if (notification.user_id !== req.user.id) {
    return error(res, 403, '无权删除此通知');
  }

  db.prepare('DELETE FROM sys_notification WHERE id = ?').run(id);

  return success(res, null, '通知删除成功');
});

module.exports = router;
