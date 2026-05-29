/**
 * 内控计划路由
 * 处理计划的CRUD、锁定/解锁、状态流转等操作
 */

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');
const { success, error, paginate } = require('../utils/response');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * 计算是否超期
 * @param {string} deadline - 截止日期 (YYYY-MM-DD)
 * @returns {boolean} 是否超期
 */
function calculateIsOverdue(deadline) {
  if (!deadline) return false;
  // 用日期字符串比较，避免时区问题
  // SQLite日期格式为YYYY-MM-DD或YYYY-MM-DD HH:MM:SS
  const deadlineDate = deadline.substring(0, 10); // 取YYYY-MM-DD部分
  const now = new Date();
  // 获取本地日期的YYYY-MM-DD
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return deadlineDate < localDate;
}

/**
 * 记录操作日志
 */
function logOperation(db, userId, username, operationType, targetType, targetId, beforeData, afterData, req) {
  db.prepare(`
    INSERT INTO sys_operation_log 
    (user_id, username, operation_type, target_type, target_id, before_data, after_data, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, username, operationType, targetType, targetId,
    beforeData ? JSON.stringify(beforeData) : null,
    afterData ? JSON.stringify(afterData) : null,
    req.ip, req.headers['user-agent'] || ''
  );
}

/**
 * 发送消息通知
 */
function createNotification(db, userId, type, title, content, planId) {
  db.prepare(`
    INSERT INTO sys_notification (user_id, type, title, content, plan_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, type, title, content, planId);
}

/**
 * 检查并处理超时锁定
 * @param {Object} plan - 计划对象
 * @returns {boolean} 是否已自动解锁
 */
function checkAndHandleLockTimeout(db, plan) {
  if (!plan.is_locked || !plan.lock_time) return false;
  
  // SQLite datetime('now')返回UTC时间字符串，需加'Z'标记为UTC
  // 否则new Date()在UTC+8环境下会解析为本地时间，产生8小时时差
  const lockTimeStr = plan.lock_time;
  const lockTime = lockTimeStr.endsWith('Z') ? new Date(lockTimeStr) : new Date(lockTimeStr + 'Z');
  const now = new Date();
  const timeoutMs = 30 * 60 * 1000; // 30分钟
  
  if (now - lockTime > timeoutMs) {
    // 超时自动解锁
    db.prepare(`
      UPDATE icp_plan 
      SET is_locked = 0, lock_by = NULL, lock_time = NULL, update_time = datetime('now')
      WHERE id = ?
    `).run(plan.id);
    return true;
  }
  return false;
}

/**
 * 验证状态流转
 * @param {string} currentStatus - 当前状态
 * @param {string} newStatus - 新状态
 * @returns {boolean} 是否允许流转
 */
function validateStatusTransition(currentStatus, newStatus) {
  const validTransitions = {
    'PENDING': ['IN_PROGRESS'],
    'IN_PROGRESS': ['CLOSED', 'CONTINUOUS'],
    'CLOSED': [], // 终态，不可流转
    'CONTINUOUS': [] // 终态，不可流转
  };
  
  return validTransitions[currentStatus]?.includes(newStatus) || false;
}

/**
 * GET /api/plans
 * 获取计划列表
 * 按角色过滤：组员看本人、组长看本组、主任看全部
 */
router.get('/', (req, res) => {
  const db = getDb();
  const { page = 1, pageSize = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  // 构建查询条件
  let whereClause = 'WHERE p.is_deleted = 0';
  const params = [];

  // 按角色过滤
  switch (req.user.role) {
    case 'MEMBER':
      // 组员能看到自己负责的或自己创建的计划
      whereClause += ' AND (p.responsible_id = ? OR p.creator_id = ?)';
      params.push(req.user.id, req.user.id);
      break;
    case 'LEADER':
      // 组长看本组所有计划
      whereClause += ' AND p.group_id = ?';
      params.push(req.user.group_id);
      break;
    // DIRECTOR和ADMIN看全部
  }

  // 筛选条件
  const { action_item, creator_name, start_date, end_date, status, is_overdue, category } = req.query;
  
  if (action_item) {
    whereClause += ' AND p.action_item LIKE ?';
    params.push(`%${action_item}%`);
  }
  
  if (creator_name) {
    whereClause += ' AND u.real_name LIKE ?';
    params.push(`%${creator_name}%`);
  }
  
  if (start_date) {
    whereClause += ' AND p.plan_deadline >= ?';
    params.push(start_date);
  }
  
  if (end_date) {
    whereClause += ' AND p.plan_deadline <= ?';
    params.push(end_date);
  }
  
  if (status) {
    whereClause += ' AND p.status = ?';
    params.push(status);
  }
  
  if (is_overdue !== undefined) {
    // 动态计算超期状态
    const today = new Date().toISOString().split('T')[0];
    if (is_overdue === '1' || is_overdue === true) {
      whereClause += ' AND p.plan_deadline < ?';
    } else {
      whereClause += ' AND p.plan_deadline >= ?';
    }
    params.push(today);
  }
  
  if (category) {
    whereClause += ' AND p.category = ?';
    params.push(category);
  }

  // 先更新超期状态
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    UPDATE icp_plan 
    SET is_overdue = CASE WHEN plan_deadline < ? AND status != 'CLOSED' AND status != 'CONTINUOUS' THEN 1 ELSE 0 END
    WHERE is_deleted = 0
  `).run(today);

  // 查询总数
  const countResult = db.prepare(`
    SELECT COUNT(*) as total
    FROM icp_plan p
    LEFT JOIN sys_user u ON p.creator_id = u.id
    LEFT JOIN sys_user r ON p.responsible_id = r.id
    LEFT JOIN sys_group g ON p.group_id = g.id
    ${whereClause}
  `).get(...params);

  // 查询列表
  const plans = db.prepare(`
    SELECT 
      p.*,
      u.real_name as creator_name,
      r.real_name as responsible_name,
      g.group_name,
      l.real_name as lock_by_name
    FROM icp_plan p
    LEFT JOIN sys_user u ON p.creator_id = u.id
    LEFT JOIN sys_user r ON p.responsible_id = r.id
    LEFT JOIN sys_group g ON p.group_id = g.id
    LEFT JOIN sys_user l ON p.lock_by = l.id
    ${whereClause}
    ORDER BY p.create_time DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  // 处理锁定状态
  plans.forEach(plan => {
    if (plan.is_locked) {
      checkAndHandleLockTimeout(db, plan);
      // 重新检查锁定状态
      const updatedPlan = db.prepare('SELECT is_locked, lock_time FROM icp_plan WHERE id = ?').get(plan.id);
      plan.is_locked = updatedPlan.is_locked;
      plan.lock_time = updatedPlan.lock_time;
    }
  });

  return paginate(res, plans, countResult.total, page, pageSize);
});

/**
 * GET /api/plans/:id
 * 获取计划详情
 */
router.get('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const plan = db.prepare(`
    SELECT 
      p.*,
      u.real_name as creator_name,
      r.real_name as responsible_name,
      g.group_name,
      l.real_name as lock_by_name
    FROM icp_plan p
    LEFT JOIN sys_user u ON p.creator_id = u.id
    LEFT JOIN sys_user r ON p.responsible_id = r.id
    LEFT JOIN sys_group g ON p.group_id = g.id
    LEFT JOIN sys_user l ON p.lock_by = l.id
    WHERE p.id = ? AND p.is_deleted = 0
  `).get(id);

  if (!plan) {
    return error(res, 404, '计划不存在');
  }

  // 权限检查
  if (req.user.role === 'MEMBER' && plan.responsible_id !== req.user.id && plan.creator_id !== req.user.id) {
    return error(res, 403, '无权查看此计划');
  }
  
  if (req.user.role === 'LEADER' && plan.group_id !== req.user.group_id) {
    return error(res, 403, '无权查看此计划');
  }

  // 检查并处理超时锁定
  if (plan.is_locked) {
    checkAndHandleLockTimeout(db, plan);
    // 重新获取锁定状态
    const updatedPlan = db.prepare('SELECT is_locked, lock_time, lock_by FROM icp_plan WHERE id = ?').get(id);
    plan.is_locked = updatedPlan.is_locked;
    plan.lock_time = updatedPlan.lock_time;
    plan.lock_by = updatedPlan.lock_by;
  }

  return success(res, plan);
});

/**
 * POST /api/plans
 * 创建计划
 * 所有角色均可创建计划（共享编辑场景，组员需录入自己的任务计划）
 */
router.post('/', requireRole('MEMBER', 'LEADER', 'DIRECTOR', 'ADMIN'), (req, res) => {
  const db = getDb();
  const {
    seq_no, category, project, action_item, plan_source, deliverable,
    responsible_id, plan_issue_date, plan_deadline, current_progress, status, remark
  } = req.body;

  // 自动生成序号：取当前最大seq_no + 1
  let finalSeqNo = seq_no;
  if (!finalSeqNo) {
    const maxResult = db.prepare('SELECT MAX(seq_no) as max_no FROM icp_plan').get();
    finalSeqNo = (maxResult?.max_no || 0) + 1;
  }

  // 参数验证
  if (!category || !action_item || !plan_deadline || !responsible_id) {
    return error(res, 400, '请填写必填字段：类别、行动项、截止日期、责任人');
  }

  // 验证责任人是否属于同一小组
  if (responsible_id) {
    const responsible = db.prepare('SELECT * FROM sys_user WHERE id = ?').get(responsible_id);
    if (!responsible) {
      return error(res, 400, '责任人不存在');
    }
    if (responsible.group_id !== req.user.group_id && req.user.role !== 'DIRECTOR' && req.user.role !== 'ADMIN') {
      return error(res, 400, '责任人必须属于本小组');
    }
  }

  // 确定小组ID：优先使用责任人的小组，其次用创建人的小组
  let groupId = req.user.group_id;
  if (responsible_id) {
    const responsible = db.prepare('SELECT group_id FROM sys_user WHERE id = ?').get(responsible_id);
    if (responsible && responsible.group_id) {
      groupId = responsible.group_id;
    }
  }
  if (!groupId && req.body.group_id) {
    groupId = req.body.group_id;
  }

  // 计算超期状态
  const is_overdue = calculateIsOverdue(plan_deadline) ? 1 : 0;

  // 创建计划（undefined值需转为null，sql.js不支持undefined绑定）
  const result = db.prepare(`
    INSERT INTO icp_plan (
      seq_no, category, project, action_item, plan_source, deliverable,
      responsible_id, plan_issue_date, plan_deadline, current_progress,
      is_overdue, status, remark, creator_id, group_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    finalSeqNo, category, project ?? null, action_item, plan_source ?? null, deliverable ?? null,
    responsible_id ?? null, plan_issue_date ?? null, plan_deadline, current_progress ?? null,
    is_overdue, status || 'PENDING', remark ?? null, req.user.id, groupId
  );

  // 记录日志
  logOperation(db, req.user.id, req.user.real_name, 'CREATE', 'PLAN', result.lastInsertRowid, null, req.body, req);

  // 获取创建的计划 - 添加兜底查询，防止sql.js内存数据库查询不到新记录
  let newPlan = db.prepare('SELECT * FROM icp_plan WHERE id = ?').get(result.lastInsertRowid);
  
  // 如果查询不到（sql.js内存数据库状态问题），使用兜底查询获取最新记录
  if (!newPlan && result.lastInsertRowid) {
    console.log('DEBUG: get()返回undefined，使用兜底查询获取新计划');
    newPlan = db.prepare('SELECT * FROM icp_plan ORDER BY id DESC LIMIT 1').get();
  }

  return success(res, newPlan, '计划创建成功');
});

/**
 * PUT /api/plans/:id
 * 更新计划
 */
router.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  // 获取原计划
  const oldPlan = db.prepare('SELECT * FROM icp_plan WHERE id = ? AND is_deleted = 0').get(id);
  if (!oldPlan) {
    return error(res, 404, '计划不存在');
  }

  // 检查锁定状态
  if (oldPlan.is_locked) {
    // 检查是否超时，如果超时则自动解锁
    const wasAutoUnlocked = checkAndHandleLockTimeout(db, oldPlan);
    
    // 重新获取最新的锁定状态
    const currentPlan = db.prepare('SELECT is_locked, lock_by FROM icp_plan WHERE id = ?').get(id);
    
    // 如果仍然被锁定（未超时或刚才是自己锁定）
    if (currentPlan.is_locked) {
      // 检查是否被他人锁定（排除自己）
      if (currentPlan.lock_by !== req.user.id) {
        return error(res, 423, '计划已被其他用户锁定，请稍后再试');
      }
    }
  }

  // 权限检查
  if (req.user.role === 'MEMBER' && oldPlan.responsible_id !== req.user.id) {
    return error(res, 403, '无权修改此计划');
  }

  // 组长只能修改本组计划
  if (req.user.role === 'LEADER' && oldPlan.group_id !== req.user.group_id) {
    return error(res, 403, '无权修改此计划');
  }

  // 验证状态流转
  const newStatus = req.body.status || oldPlan.status;
  if (req.body.status && req.body.status !== oldPlan.status) {
    if (!validateStatusTransition(oldPlan.status, req.body.status)) {
      return error(res, 400, `状态不能从${oldPlan.status}流转到${req.body.status}`);
    }
  }

  // 验证责任人变更（如果是组长或管理员）
  if (req.body.responsible_id && req.body.responsible_id !== oldPlan.responsible_id) {
    if (req.user.role === 'MEMBER') {
      return error(res, 403, '无权修改责任人');
    }
    
    const newResponsible = db.prepare('SELECT * FROM sys_user WHERE id = ?').get(req.body.responsible_id);
    if (!newResponsible) {
      return error(res, 400, '责任人不存在');
    }
    if (newResponsible.group_id !== oldPlan.group_id) {
      return error(res, 400, '责任人必须属于同一小组');
    }
  }

  // 构建更新字段
  const updateFields = [];
  const params = [];
  
  const allowedFields = [
    'seq_no', 'category', 'project', 'action_item', 'plan_source', 'deliverable',
    'responsible_id', 'plan_issue_date', 'plan_deadline', 'current_progress', 'status', 'remark'
  ];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateFields.push(`${field} = ?`);
      params.push(req.body[field]);
    }
  });

  // 计算超期状态
  const planDeadline = req.body.plan_deadline || oldPlan.plan_deadline;
  const currentStatus = req.body.status || oldPlan.status;
  let is_overdue = 0;
  if (currentStatus !== 'CLOSED' && currentStatus !== 'CONTINUOUS') {
    is_overdue = calculateIsOverdue(planDeadline) ? 1 : 0;
  }
  updateFields.push('is_overdue = ?');
  params.push(is_overdue);

  updateFields.push("update_time = datetime('now')");
  params.push(id);

  // 执行更新
  db.prepare(`UPDATE icp_plan SET ${updateFields.join(', ')} WHERE id = ?`).run(...params);

  // 获取更新后的计划
  const updatedPlan = db.prepare('SELECT * FROM icp_plan WHERE id = ?').get(id);

  // 记录操作日志
  logOperation(db, req.user.id, req.user.real_name, 'UPDATE', 'PLAN', id, oldPlan, updatedPlan, req);

  // 发送通知（如果责任人或创建者发生变化）
  if (req.body.responsible_id && req.body.responsible_id !== oldPlan.responsible_id) {
    // 通知原责任人
    if (oldPlan.responsible_id) {
      createNotification(
        db, oldPlan.responsible_id, 'PLAN_MODIFIED',
        '计划责任人变更',
        `计划"${updatedPlan.action_item}"的责任人已变更为其他人`,
        id
      );
    }
    // 通知新责任人
    createNotification(
      db, req.body.responsible_id, 'PLAN_MODIFIED',
      '您被指定为计划责任人',
      `您已被指定为计划"${updatedPlan.action_item}"的责任人`,
      id
    );
  }

  // 如果计划被修改且责任人存在，通知责任人
  if (updatedPlan.responsible_id && updatedPlan.responsible_id !== req.user.id) {
    // 检查是否有实质性修改
    const hasChange = Object.keys(req.body).some(key => {
      if (key in oldPlan) {
        return oldPlan[key] !== req.body[key];
      }
      return false;
    });
    
    if (hasChange) {
      createNotification(
        db, updatedPlan.responsible_id, 'PLAN_MODIFIED',
        '计划被修改',
        `计划"${updatedPlan.action_item}"已被${req.user.real_name}修改`,
        id
      );
    }
  }

  return success(res, updatedPlan, '计划更新成功');
});

/**
 * POST /api/plans/import
 * 批量导入计划（必须在/:id路由之前注册）
 */
router.post('/import', requireRole('MEMBER', 'LEADER', 'DIRECTOR', 'ADMIN'), (req, res) => {
  const db = getDb();
  const { plans } = req.body;

  if (!Array.isArray(plans) || plans.length === 0) {
    return error(res, 400, '请提供计划数据数组');
  }

  if (plans.length > 500) {
    return error(res, 400, '单次导入不超过500条');
  }

  // 状态映射：中文→英文
  const statusMap = {
    '待执行': 'PENDING', '执行中': 'IN_PROGRESS', '已归零': 'CLOSED', '持续开展': 'CONTINUOUS',
    'PENDING': 'PENDING', 'IN_PROGRESS': 'IN_PROGRESS', 'CLOSED': 'CLOSED', 'CONTINUOUS': 'CONTINUOUS'
  };

  const results = { success: 0, failed: 0, errors: [] };

  // 获取当前最大序号
  const maxResult = db.prepare('SELECT MAX(seq_no) as max_no FROM icp_plan').get();
  let nextSeqNo = (maxResult?.max_no || 0) + 1;

  plans.forEach((item, index) => {
    try {
      // 校验必填字段
      if (!item.category && !item['类别']) {
        results.errors.push(`第${index + 1}行：类别不能为空`);
        results.failed++;
        return;
      }
      if (!item.action_item && !item['行动项']) {
        results.errors.push(`第${index + 1}行：行动项不能为空`);
        results.failed++;
        return;
      }
      if (!item.plan_deadline && !item['截止日期']) {
        results.errors.push(`第${index + 1}行：截止日期不能为空`);
        results.failed++;
        return;
      }

      // 字段映射（兼容中英文表头）
      const category = item.category || item['类别'];
      const project = item.project || item['项目'] || null;
      const actionItem = item.action_item || item['行动项'];
      const planSource = item.plan_source || item['计划来源'] || null;
      const deliverable = item.deliverable || item['交付物'] || null;
      const planIssueDate = item.plan_issue_date || item['下发日期'] || item['计划下发日期'] || null;
      const planDeadline = item.plan_deadline || item['截止日期'];
      const currentProgress = item.current_progress || item['当前进展'] || item['进展'] || null;
      const remark = item.remark || item['备注'] || null;

      // 处理状态
      let status = item.status || item['状态'] || 'PENDING';
      status = statusMap[status] || 'PENDING';

      // 处理责任人（通过工号匹配）
      let responsibleId = null;
      const responsibleUsername = item.responsible_username || item['责任人(工号)'] || item['责任人工号'] || item['责任人'];
      if (responsibleUsername) {
        const responsible = db.prepare('SELECT id, group_id FROM sys_user WHERE username = ? AND status = 1').get(String(responsibleUsername));
        if (responsible) {
          responsibleId = responsible.id;
        }
      }

      // 确定小组ID
      let groupId = req.user.group_id;
      if (responsibleId) {
        const responsible = db.prepare('SELECT group_id FROM sys_user WHERE id = ?').get(responsibleId);
        if (responsible && responsible.group_id) {
          groupId = responsible.group_id;
        }
      }

      // 处理序号
      const seqNo = item.seq_no || item['序号'] || nextSeqNo;
      nextSeqNo = Math.max(nextSeqNo, seqNo + 1);

      // 计算超期
      const isOverdue = calculateIsOverdue(planDeadline) ? 1 : 0;

      // 插入计划
      db.prepare(`
        INSERT INTO icp_plan (
          seq_no, category, project, action_item, plan_source, deliverable,
          responsible_id, plan_issue_date, plan_deadline, current_progress,
          is_overdue, status, remark, creator_id, group_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        seqNo, category, project, actionItem, planSource, deliverable,
        responsibleId, planIssueDate, planDeadline, currentProgress,
        isOverdue, status, remark, req.user.id, groupId
      );

      results.success++;
    } catch (err) {
      results.errors.push(`第${index + 1}行：${err.message}`);
      results.failed++;
    }
  });

  // 记录导入日志
  logOperation(db, req.user.id, req.user.real_name, 'IMPORT', 'PLAN', null, null, { total: plans.length, success: results.success, failed: results.failed }, req);

  return success(res, results, `导入完成：成功${results.success}条，失败${results.failed}条`);
});

/**
 * DELETE /api/plans/:id
 * 软删除计划
 */
router.delete('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const plan = db.prepare('SELECT * FROM icp_plan WHERE id = ? AND is_deleted = 0').get(id);
  if (!plan) {
    return error(res, 404, '计划不存在');
  }

  // 权限检查：只有创建人、组长、管理员可以删除
  if (req.user.role === 'MEMBER' && plan.creator_id !== req.user.id) {
    return error(res, 403, '无权删除此计划');
  }

  if (req.user.role === 'LEADER' && plan.group_id !== req.user.group_id) {
    return error(res, 403, '无权删除此计划');
  }

  // 软删除
  db.prepare(`
    UPDATE icp_plan 
    SET is_deleted = 1, update_time = datetime('now')
    WHERE id = ?
  `).run(id);

  // 记录日志
  logOperation(db, req.user.id, req.user.real_name, 'DELETE', 'PLAN', id, plan, null, req);

  return success(res, null, '计划删除成功');
});

/**
 * POST /api/plans/lock/:id
 * 锁定计划
 */
router.post('/lock/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const plan = db.prepare('SELECT * FROM icp_plan WHERE id = ? AND is_deleted = 0').get(id);
  if (!plan) {
    return error(res, 404, '计划不存在');
  }

  // 检查是否已被锁定
  if (plan.is_locked) {
    // 检查是否超时
    if (checkAndHandleLockTimeout(db, plan)) {
      // 已自动解锁，重新锁定
    } else if (plan.lock_by !== req.user.id) {
      return error(res, 423, '计划已被其他用户锁定');
    } else {
      return error(res, 423, '您已锁定此计划');
    }
  }

  // 锁定计划
  db.prepare(`
    UPDATE icp_plan 
    SET is_locked = 1, lock_by = ?, lock_time = datetime('now'), update_time = datetime('now')
    WHERE id = ?
  `).run(req.user.id, id);

  // 记录日志
  logOperation(db, req.user.id, req.user.real_name, 'UPDATE', 'PLAN_LOCK', id, null, { locked: true, action_item: plan.action_item }, req);

  const updatedPlan = db.prepare('SELECT * FROM icp_plan WHERE id = ?').get(id);
  return success(res, updatedPlan, '计划锁定成功');
});

/**
 * POST /api/plans/unlock/:id
 * 解锁计划（只能解锁自己的锁定）
 */
router.post('/unlock/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const plan = db.prepare('SELECT * FROM icp_plan WHERE id = ? AND is_deleted = 0').get(id);
  if (!plan) {
    return error(res, 404, '计划不存在');
  }

  // 检查锁定状态
  if (!plan.is_locked) {
    return error(res, 400, '计划未被锁定');
  }

  // 检查是否超时
  if (checkAndHandleLockTimeout(db, plan)) {
    return success(res, null, '计划锁定已超时，已自动解锁');
  }

  // 检查是否是自己的锁定
  if (plan.lock_by !== req.user.id) {
    return error(res, 403, '只能解锁自己的锁定');
  }

  // 解锁
  db.prepare(`
    UPDATE icp_plan 
    SET is_locked = 0, lock_by = NULL, lock_time = NULL, update_time = datetime('now')
    WHERE id = ?
  `).run(id);

  // 记录日志
  logOperation(db, req.user.id, req.user.real_name, 'UPDATE', 'PLAN_UNLOCK', id, { locked: true, action_item: plan.action_item }, null, req);

  const updatedPlan = db.prepare('SELECT * FROM icp_plan WHERE id = ?').get(id);
  return success(res, updatedPlan, '计划解锁成功');
});

/**
 * POST /api/plans/manual-unlock/:id
 * 手动解锁（仅组长/管理员）
 */
router.post('/manual-unlock/:id', requireRole('LEADER', 'DIRECTOR', 'ADMIN'), (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const plan = db.prepare('SELECT * FROM icp_plan WHERE id = ? AND is_deleted = 0').get(id);
  if (!plan) {
    return error(res, 404, '计划不存在');
  }

  if (!plan.is_locked) {
    return error(res, 400, '计划未被锁定');
  }

  // 组长只能操作本组计划
  if (req.user.role === 'LEADER' && plan.group_id !== req.user.group_id) {
    return error(res, 403, '无权操作此计划');
  }

  // 获取锁定者信息
  const locker = db.prepare('SELECT real_name FROM sys_user WHERE id = ?').get(plan.lock_by);

  // 强制解锁
  db.prepare(`
    UPDATE icp_plan 
    SET is_locked = 0, lock_by = NULL, lock_time = NULL, update_time = datetime('now')
    WHERE id = ?
  `).run(id);

  // 记录日志
  logOperation(db, req.user.id, req.user.real_name, 'UPDATE', 'PLAN_MANUAL_UNLOCK', id, { locked: true, lock_by: plan.lock_by, action_item: plan.action_item }, null, req);

  // 通知原锁定者
  if (plan.lock_by !== req.user.id) {
    createNotification(
      db, plan.lock_by, 'PLAN_MODIFIED',
      '计划被强制解锁',
      `计划"${plan.action_item}"已被${req.user.real_name}强制解锁`,
      id
    );
  }

  const updatedPlan = db.prepare('SELECT * FROM icp_plan WHERE id = ?').get(id);
  return success(res, updatedPlan, `已强制解锁，计划原被${locker?.real_name || '未知用户'}锁定`);
});

module.exports = router;
