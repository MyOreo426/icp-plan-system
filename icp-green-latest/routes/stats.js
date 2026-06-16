/**
 * 统计数据路由
 * 提供仪表盘、报表等所需的统计数据
 */

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');
const { success, error } = require('../utils/response');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * GET /api/stats/dashboard
 * 获取仪表盘统计数据
 */
router.get('/dashboard', (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const userRole = req.user.role;
  const groupId = req.user.group_id;

  // 构建数据权限过滤条件
  let planWhere = 'WHERE p.is_deleted = 0';
  const planParams = [];

  if (userRole === 'MEMBER') {
    // 成员：看自己负责的和自己创建的
    planWhere += ' AND (p.responsible_id = ? OR p.creator_id = ?)';
    planParams.push(userId, userId);
  } else if (userRole === 'LEADER') {
    // 组长：看本组的
    planWhere += ' AND p.group_id = ?';
    planParams.push(groupId);
  }
  // DIRECTOR和ADMIN看全部

  // 1. 基础统计
  const totalResult = db.prepare(`
    SELECT COUNT(*) as total FROM icp_plan p ${planWhere}
  `).get(...planParams);

  const statusCounts = db.prepare(`
    SELECT p.status, COUNT(*) as count 
    FROM icp_plan p 
    ${planWhere}
    GROUP BY p.status
  `).all(...planParams);

  // 按状态分类统计
  const statusMap = {};
  statusCounts.forEach(s => {
    statusMap[s.status] = s.count;
  });

  // 2. 逾期统计（截止日期早于今天且未完成）
  const today = new Date().toISOString().split('T')[0];
  const overdueResult = db.prepare(`
    SELECT COUNT(*) as count 
    FROM icp_plan p 
    ${planWhere}
    AND p.plan_deadline < ? 
    AND p.status NOT IN ('CLOSED', 'CONTINUOUS')
  `).get(...planParams, today);

  // 3. 即将到期（7天内）
  const sevenDaysLater = new Date();
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const sevenDaysStr = sevenDaysLater.toISOString().split('T')[0];
  
  const upcomingResult = db.prepare(`
    SELECT COUNT(*) as count 
    FROM icp_plan p 
    ${planWhere}
    AND p.plan_deadline >= ? 
    AND p.plan_deadline <= ?
    AND p.status NOT IN ('CLOSED', 'CONTINUOUS')
  `).get(...planParams, today, sevenDaysStr);

  // 4. 按类别统计
  const categoryStats = db.prepare(`
    SELECT p.category, COUNT(*) as count 
    FROM icp_plan p 
    ${planWhere}
    GROUP BY p.category
    ORDER BY count DESC
  `).all(...planParams);

  // 5. 本月新增
  const thisMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const monthlyNewResult = db.prepare(`
    SELECT COUNT(*) as count 
    FROM icp_plan p 
    ${planWhere}
    AND strftime('%Y-%m', p.create_time) = ?
  `).get(...planParams, thisMonth);

  // 6. 按小组统计（管理员/主任可见）
  let groupStats = [];
  if (userRole === 'ADMIN' || userRole === 'DIRECTOR') {
    groupStats = db.prepare(`
      SELECT g.id, g.group_name, g.department, COUNT(p.id) as plan_count,
             SUM(CASE WHEN p.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress_count,
             SUM(CASE WHEN p.status = 'CLOSED' THEN 1 ELSE 0 END) as closed_count,
             SUM(CASE WHEN p.plan_deadline < date('now') AND p.status NOT IN ('CLOSED','CONTINUOUS') THEN 1 ELSE 0 END) as overdue_count
      FROM sys_group g
      LEFT JOIN icp_plan p ON g.id = p.group_id AND p.is_deleted = 0
      WHERE g.status = 1
      GROUP BY g.id
      ORDER BY plan_count DESC
    `).all();
  }

  // 7. 按责任人统计（top 10）
  let userStats = [];
  if (userRole === 'ADMIN' || userRole === 'DIRECTOR' || userRole === 'LEADER') {
    let userWhere = 'WHERE u.status = 1';
    const userParams = [];
    
    if (userRole === 'LEADER') {
      userWhere += ' AND u.group_id = ?';
      userParams.push(groupId);
    }
    
    userStats = db.prepare(`
      SELECT u.id, u.username, u.real_name, u.role, g.group_name,
             COUNT(p.id) as plan_count
      FROM sys_user u
      LEFT JOIN sys_group g ON u.group_id = g.id
      LEFT JOIN icp_plan p ON u.id = p.responsible_id AND p.is_deleted = 0
      ${userWhere}
      GROUP BY u.id
      ORDER BY plan_count DESC
      LIMIT 10
    `).all(...userParams);
  }

  // 8. 最近30天趋势（按天）
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysStr = thirtyDaysAgo.toISOString().split('T')[0];
  
  const dailyTrend = db.prepare(`
    SELECT strftime('%Y-%m-%d', p.create_time) as date, COUNT(*) as count
    FROM icp_plan p
    ${planWhere}
    AND p.create_time >= ?
    GROUP BY strftime('%Y-%m-%d', p.create_time)
    ORDER BY date ASC
  `).all(...planParams, thirtyDaysStr + ' 00:00:00');

  // 9. 用户数统计（管理员可见）
  let userCountStats = null;
  if (userRole === 'ADMIN') {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM sys_user').get();
    const activeUsers = db.prepare("SELECT COUNT(*) as count FROM sys_user WHERE status = 1").get();
    userCountStats = {
      total: totalUsers.count,
      active: activeUsers.count
    };
  }

  return success(res, {
    // 基础概览
    total_plans: totalResult.total,
    pending_count: statusMap.PENDING || 0,
    in_progress_count: statusMap.IN_PROGRESS || 0,
    closed_count: statusMap.CLOSED || 0,
    continuous_count: statusMap.CONTINUOUS || 0,
    overdue_count: overdueResult.count,
    upcoming_count: upcomingResult.count,
    monthly_new_count: monthlyNewResult.count,
    
    // 分类统计
    by_category: categoryStats,
    
    // 趋势数据
    daily_trend: dailyTrend,
    
    // 小组统计
    by_group: groupStats,
    
    // 用户统计
    by_user: userStats,
    user_count: userCountStats
  });
});

/**
 * GET /api/stats/overview
 * 系统概览统计（管理员用）
 */
router.get('/overview', requireRole('ADMIN'), (req, res) => {
  const db = getDb();

  // 用户统计
  const userStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN role = 'ADMIN' THEN 1 ELSE 0 END) as admin_count,
      SUM(CASE WHEN role = 'DIRECTOR' THEN 1 ELSE 0 END) as director_count,
      SUM(CASE WHEN role = 'LEADER' THEN 1 ELSE 0 END) as leader_count,
      SUM(CASE WHEN role = 'MEMBER' THEN 1 ELSE 0 END) as member_count
    FROM sys_user
  `).get();

  // 小组统计
  const groupStats = db.prepare(`
    SELECT COUNT(*) as total 
    FROM sys_group 
    WHERE status = 1
  `).get();

  // 计划统计
  const planStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as closed,
      SUM(CASE WHEN status = 'CONTINUOUS' THEN 1 ELSE 0 END) as continuous,
      SUM(CASE WHEN plan_deadline < date('now') AND status NOT IN ('CLOSED','CONTINUOUS') THEN 1 ELSE 0 END) as overdue
    FROM icp_plan
    WHERE is_deleted = 0
  `).get();

  // 日志统计（最近7天）
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const logStats = db.prepare(`
    SELECT COUNT(*) as total_7days
    FROM sys_operation_log
    WHERE operation_time >= ?
  `).get(sevenDaysAgo.toISOString().replace('T', ' ').substring(0, 19));

  return success(res, {
    users: userStats,
    groups: groupStats,
    plans: planStats,
    logs: logStats
  });
});

module.exports = router;
