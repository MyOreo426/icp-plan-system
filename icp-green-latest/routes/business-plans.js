/**
 * 经营计划路由
 * 处理经营计划的CRUD、导入导出、数据清除等操作
 */

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');
const { success, error, paginate } = require('../utils/response');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * GET /api/business-plans
 * 获取经营计划列表（支持分页、筛选）
 */
router.get('/', (req, res) => {
  const db = getDb();
  const { page = 1, pageSize = 20, plan_name, plan_type, department, completion_status, is_new_period } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  // 构建查询条件
  let whereClause = 'WHERE 1=1';
  const params = [];

  if (plan_name) {
    whereClause += ' AND plan_name LIKE ?';
    params.push(`%${plan_name}%`);
  }
  if (plan_type) {
    whereClause += ' AND plan_type = ?';
    params.push(plan_type);
  }
  if (department) {
    whereClause += ' AND department = ?';
    params.push(department);
  }
  if (completion_status) {
    whereClause += ' AND completion_status = ?';
    params.push(completion_status);
  }
  if (is_new_period !== undefined && is_new_period !== '') {
    whereClause += ' AND is_new_period = ?';
    params.push(is_new_period === '1' || is_new_period === true ? 1 : 0);
  }

  // 查询总数
  const countResult = db.prepare(`
    SELECT COUNT(*) as total
    FROM business_plan
    ${whereClause}
  `).get(...params);

  // 查询列表
  const plans = db.prepare(`
    SELECT *
    FROM business_plan
    ${whereClause}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  return paginate(res, plans, countResult.total, page, pageSize);
});

/**
 * GET /api/business-plans/all
 * 获取所有经营计划（不分页，用于导出）
 */
router.get('/all', (req, res) => {
  const db = getDb();
  const { plan_name, plan_type, department, completion_status, is_new_period } = req.query;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (plan_name) {
    whereClause += ' AND plan_name LIKE ?';
    params.push(`%${plan_name}%`);
  }
  if (plan_type) {
    whereClause += ' AND plan_type = ?';
    params.push(plan_type);
  }
  if (department) {
    whereClause += ' AND department = ?';
    params.push(department);
  }
  if (completion_status) {
    whereClause += ' AND completion_status = ?';
    params.push(completion_status);
  }
  if (is_new_period !== undefined && is_new_period !== '') {
    whereClause += ' AND is_new_period = ?';
    params.push(is_new_period === '1' || is_new_period === true ? 1 : 0);
  }

  const plans = db.prepare(`
    SELECT *
    FROM business_plan
    ${whereClause}
    ORDER BY id DESC
  `).all(...params);

  return success(res, plans);
});

/**
 * GET /api/business-plans/:id
 * 获取经营计划详情
 */
router.get('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const plan = db.prepare('SELECT * FROM business_plan WHERE id = ?').get(id);

  if (!plan) {
    return error(res, 404, '经营计划不存在');
  }

  return success(res, plan);
});

/**
 * POST /api/business-plans
 * 新增经营计划
 */
router.post('/', requireRole('LEADER', 'DIRECTOR', 'ADMIN'), (req, res) => {
  const db = getDb();
  const { plan_name, plan_type, department, issue_date, expected_finish_date, plan_finish_date, completion_status, is_new_period } = req.body;

  if (!plan_name) {
    return error(res, 400, '计划名称不能为空');
  }

  const result = db.prepare(`
    INSERT INTO business_plan (
      plan_name, plan_type, department, issue_date,
      expected_finish_date, plan_finish_date, completion_status, is_new_period, creator_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    plan_name,
    plan_type || null,
    department || null,
    issue_date || null,
    expected_finish_date || null,
    plan_finish_date || null,
    completion_status || '未完成',
    is_new_period ? 1 : 0,
    req.user.id
  );

  // 记录操作日志
  db.prepare(`
    INSERT INTO sys_operation_log 
    (user_id, username, operation_type, target_type, target_id, before_data, after_data, ip_address, user_agent)
    VALUES (?, ?, 'CREATE', 'BUSINESS_PLAN', ?, NULL, ?, ?, ?)
  `).run(
    req.user.id, req.user.real_name, result.lastInsertRowid,
    JSON.stringify(req.body), req.ip, req.headers['user-agent'] || ''
  );

  return success(res, { id: result.lastInsertRowid }, '创建成功');
});

/**
 * PUT /api/business-plans/:id
 * 更新经营计划
 */
router.put('/:id', requireRole('LEADER', 'DIRECTOR', 'ADMIN'), (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { plan_name, plan_type, department, issue_date, expected_finish_date, plan_finish_date, completion_status, is_new_period } = req.body;

  const existing = db.prepare('SELECT * FROM business_plan WHERE id = ?').get(id);
  if (!existing) {
    return error(res, 404, '经营计划不存在');
  }

  db.prepare(`
    UPDATE business_plan SET
      plan_name = ?,
      plan_type = ?,
      department = ?,
      issue_date = ?,
      expected_finish_date = ?,
      plan_finish_date = ?,
      completion_status = ?,
      is_new_period = ?,
      update_time = datetime('now')
    WHERE id = ?
  `).run(
    plan_name || existing.plan_name,
    plan_type !== undefined ? plan_type : existing.plan_type,
    department !== undefined ? department : existing.department,
    issue_date !== undefined ? issue_date : existing.issue_date,
    expected_finish_date !== undefined ? expected_finish_date : existing.expected_finish_date,
    plan_finish_date !== undefined ? plan_finish_date : existing.plan_finish_date,
    completion_status !== undefined ? completion_status : existing.completion_status,
    is_new_period !== undefined ? (is_new_period ? 1 : 0) : existing.is_new_period,
    id
  );

  // 记录操作日志
  db.prepare(`
    INSERT INTO sys_operation_log 
    (user_id, username, operation_type, target_type, target_id, before_data, after_data, ip_address, user_agent)
    VALUES (?, ?, 'UPDATE', 'BUSINESS_PLAN', ?, ?, ?, ?, ?)
  `).run(
    req.user.id, req.user.real_name, id,
    JSON.stringify(existing), JSON.stringify(req.body),
    req.ip, req.headers['user-agent'] || ''
  );

  return success(res, null, '更新成功');
});

/**
 * DELETE /api/business-plans/:id
 * 删除单个经营计划
 */
router.delete('/:id', requireRole('LEADER', 'DIRECTOR', 'ADMIN'), (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM business_plan WHERE id = ?').get(id);
  if (!existing) {
    return error(res, 404, '经营计划不存在');
  }

  db.prepare('DELETE FROM business_plan WHERE id = ?').run(id);

  // 记录操作日志
  db.prepare(`
    INSERT INTO sys_operation_log 
    (user_id, username, operation_type, target_type, target_id, before_data, after_data, ip_address, user_agent)
    VALUES (?, ?, 'DELETE', 'BUSINESS_PLAN', ?, ?, NULL, ?, ?)
  `).run(
    req.user.id, req.user.real_name, id,
    JSON.stringify(existing), req.ip, req.headers['user-agent'] || ''
  );

  return success(res, null, '删除成功');
});

/**
 * POST /api/business-plans/import
 * 批量导入经营计划（Excel导入）
 */
router.post('/import', requireRole('LEADER', 'DIRECTOR', 'ADMIN'), (req, res) => {
  const db = getDb();
  const { plans } = req.body;

  if (!Array.isArray(plans) || plans.length === 0) {
    return error(res, 400, '请提供经营计划数据数组');
  }

  if (plans.length > 1000) {
    return error(res, 400, '单次导入不超过1000条');
  }

  const results = { success: 0, failed: 0, errors: [] };

  // 字段映射表：支持多种中文表头
  const fieldMappings = {
    plan_name: ['计划名称', '计划名', '名称', 'plan_name', 'planName'],
    plan_type: ['计划类型', '类型', '类别', 'plan_type', 'planType'],
    department: ['责任科室', '科室', '部门', 'department', 'dept'],
    issue_date: ['计划下达日期', '下达日期', '发布日期', '开始日期', 'issue_date', 'issueDate'],
    expected_finish_date: ['预计完成时间', '预计完成日期', '完成日期', '截止日期', 'expected_finish_date', 'expectedFinishDate'],
    plan_finish_date: ['计划完成日期', '计划完成时间', '计划日期', 'plan_finish_date', 'planFinishDate'],
    completion_status: ['完成情况', '完成状态', '状态', 'completion_status', 'completionStatus'],
    is_new_period: ['是否本期新增', '本期新增', '是否新增', '新增', 'is_new_period', 'isNewPeriod']
  };

  function getFieldValue(item, fieldName) {
    const aliases = fieldMappings[fieldName];
    for (let i = 0; i < aliases.length; i++) {
      if (item[aliases[i]] !== undefined && item[aliases[i]] !== null && item[aliases[i]] !== '') {
        return item[aliases[i]];
      }
    }
    return undefined;
  }

  plans.forEach((item, index) => {
    try {
      const planName = getFieldValue(item, 'plan_name');
      if (!planName) {
        results.errors.push(`第${index + 1}行：计划名称不能为空`);
        results.failed++;
        return;
      }

      const planType = getFieldValue(item, 'plan_type') || null;
      const department = getFieldValue(item, 'department') || null;
      const issueDate = getFieldValue(item, 'issue_date') || null;
      const expectedFinishDate = getFieldValue(item, 'expected_finish_date') || null;
      const planFinishDate = getFieldValue(item, 'plan_finish_date') || null;
      let completionStatus = getFieldValue(item, 'completion_status') || '未完成';
      let isNewPeriod = getFieldValue(item, 'is_new_period');

      // 处理完成状态
      if (completionStatus === '是' || completionStatus === '已完成' || completionStatus === true || completionStatus === 1) {
        completionStatus = '已完成';
      } else if (completionStatus === '否' || completionStatus === '未完成' || completionStatus === false || completionStatus === 0) {
        completionStatus = '未完成';
      } else if (completionStatus === '进行中' || completionStatus === '正在进行') {
        completionStatus = '进行中';
      }

      // 处理是否本期新增
      if (isNewPeriod === '是' || isNewPeriod === true || isNewPeriod === 1 || isNewPeriod === '1') {
        isNewPeriod = 1;
      } else {
        isNewPeriod = 0;
      }

      // 处理日期格式（Excel可能返回数字或字符串）
      const formatDate = function(dateVal) {
        if (!dateVal) return null;
        if (typeof dateVal === 'number') {
          // Excel日期序列转日期
          const date = new Date((dateVal - 25569) * 86400 * 1000);
          return date.toISOString().split('T')[0];
        }
        // 字符串日期
        const str = String(dateVal).trim();
        // 尝试解析 YYYY-MM-DD 或 YYYY/MM/DD 等格式
        const parsed = new Date(str.replace(/\//g, '-'));
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
        return str; // 保持原样
      };

      db.prepare(`
        INSERT INTO business_plan (
          plan_name, plan_type, department, issue_date,
          expected_finish_date, plan_finish_date, completion_status, is_new_period, creator_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        planName,
        planType,
        department,
        formatDate(issueDate),
        formatDate(expectedFinishDate),
        formatDate(planFinishDate),
        completionStatus,
        isNewPeriod,
        req.user.id
      );

      results.success++;
    } catch (err) {
      results.errors.push(`第${index + 1}行：${err.message}`);
      results.failed++;
    }
  });

  // 记录导入日志
  db.prepare(`
    INSERT INTO sys_operation_log 
    (user_id, username, operation_type, target_type, target_id, before_data, after_data, ip_address, user_agent)
    VALUES (?, ?, 'IMPORT', 'BUSINESS_PLAN', NULL, NULL, ?, ?, ?)
  `).run(
    req.user.id, req.user.real_name,
    JSON.stringify({ total: plans.length, success: results.success, failed: results.failed }),
    req.ip, req.headers['user-agent'] || ''
  );

  return success(res, results, `导入完成：成功${results.success}条，失败${results.failed}条`);
});

/**
 * POST /api/business-plans/clear
 * 物理删除全部经营计划数据
 */
router.post('/clear', requireRole('DIRECTOR', 'ADMIN'), (req, res) => {
  const db = getDb();

  // 先统计数量
  const countResult = db.prepare('SELECT COUNT(*) as total FROM business_plan').get();

  // 物理删除全部
  db.prepare('DELETE FROM business_plan').run();

  // 记录操作日志
  db.prepare(`
    INSERT INTO sys_operation_log 
    (user_id, username, operation_type, target_type, target_id, before_data, after_data, ip_address, user_agent)
    VALUES (?, ?, 'DELETE', 'BUSINESS_PLAN_CLEAR', NULL, ?, NULL, ?, ?)
  `).run(
    req.user.id, req.user.real_name,
    JSON.stringify({ cleared_count: countResult.total }),
    req.ip, req.headers['user-agent'] || ''
  );

  return success(res, { cleared_count: countResult.total }, `已清除${countResult.total}条经营计划数据`);
});

/**
 * GET /api/business-plans/stats/completion-by-type
 * 按计划类型统计完成情况（堆叠柱状图数据）
 */
router.get('/stats/completion-by-type', (req, res) => {
  const db = getDb();

  // 按计划类型和完成状态统计
  const stats = db.prepare(`
    SELECT 
      plan_type,
      completion_status,
      COUNT(*) as count
    FROM business_plan
    WHERE plan_type IS NOT NULL AND plan_type != ''
    GROUP BY plan_type, completion_status
    ORDER BY plan_type
  `).all();

  // 整理数据
  const typeMap = {};
  stats.forEach(s => {
    if (!typeMap[s.plan_type]) {
      typeMap[s.plan_type] = { plan_type: s.plan_type, completed: 0, incomplete: 0, total: 0 };
    }
    if (s.completion_status === '已完成') {
      typeMap[s.plan_type].completed = s.count;
    } else {
      typeMap[s.plan_type].incomplete += s.count;
    }
    typeMap[s.plan_type].total += s.count;
  });

  const result = Object.values(typeMap).map(item => ({
    ...item,
    completion_rate: item.total > 0 ? ((item.completed / item.total) * 100).toFixed(1) + '%' : '0%'
  }));

  return success(res, result);
});

/**
 * GET /api/business-plans/stats/by-department
 * 按责任科室统计完成分布情况
 */
router.get('/stats/by-department', (req, res) => {
  const db = getDb();

  // 按科室、计划类型、完成状态统计
  const stats = db.prepare(`
    SELECT 
      department,
      plan_type,
      completion_status,
      COUNT(*) as count
    FROM business_plan
    WHERE department IS NOT NULL AND department != ''
    GROUP BY department, plan_type, completion_status
    ORDER BY department, plan_type
  `).all();

  // 整理数据
  const deptMap = {};
  const allTypes = new Set();

  stats.forEach(s => {
    if (!deptMap[s.department]) {
      deptMap[s.department] = { department: s.department, types: {}, total: 0, completed: 0 };
    }
    if (!deptMap[s.department].types[s.plan_type || '其他']) {
      deptMap[s.department].types[s.plan_type || '其他'] = { completed: 0, incomplete: 0, total: 0 };
    }
    const typeData = deptMap[s.department].types[s.plan_type || '其他'];
    if (s.completion_status === '已完成') {
      typeData.completed = s.count;
      deptMap[s.department].completed += s.count;
    } else {
      typeData.incomplete += s.count;
    }
    typeData.total += s.count;
    deptMap[s.department].total += s.count;
    allTypes.add(s.plan_type || '其他');
  });

  const result = {
    departments: Object.keys(deptMap),
    plan_types: Array.from(allTypes),
    data: Object.values(deptMap).map(d => ({
      department: d.department,
      total: d.total,
      completed: d.completed,
      completion_rate: d.total > 0 ? ((d.completed / d.total) * 100).toFixed(1) + '%' : '0%',
      type_breakdown: d.types
    }))
  };

  return success(res, result);
});

/**
 * GET /api/business-plans/stats/finish-date-compare
 * 预计完成日期 vs 计划完成日期 月度对比（瀑布图/分组柱状图数据）
 * 支持按计划类型分组
 */
router.get('/stats/finish-date-compare', (req, res) => {
  const db = getDb();
  const currentYear = new Date().getFullYear();
  const groupByType = req.query.group_by_type === '1' || req.query.groupByType === '1';

  if (groupByType) {
    // 按类型分组统计
    // 1. 按月份+类型统计预计完成数量
    const expectedByType = db.prepare(`
      SELECT 
        CAST(strftime('%m', expected_finish_date) AS INTEGER) as month,
        plan_type,
        COUNT(*) as count
      FROM business_plan
      WHERE expected_finish_date IS NOT NULL 
        AND expected_finish_date != ''
        AND strftime('%Y', expected_finish_date) = ?
        AND plan_type IS NOT NULL AND plan_type != ''
      GROUP BY strftime('%m', expected_finish_date), plan_type
      ORDER BY month, plan_type
    `).all(currentYear.toString());

    // 2. 按月份+类型统计计划完成数量
    const plannedByType = db.prepare(`
      SELECT 
        CAST(strftime('%m', plan_finish_date) AS INTEGER) as month,
        plan_type,
        COUNT(*) as count
      FROM business_plan
      WHERE plan_finish_date IS NOT NULL 
        AND plan_finish_date != ''
        AND strftime('%Y', plan_finish_date) = ?
        AND plan_type IS NOT NULL AND plan_type != ''
      GROUP BY strftime('%m', plan_finish_date), plan_type
      ORDER BY month, plan_type
    `).all(currentYear.toString());

    // 3. 获取所有计划类型
    const typesResult = db.prepare(`
      SELECT DISTINCT plan_type
      FROM business_plan
      WHERE plan_type IS NOT NULL AND plan_type != ''
      ORDER BY plan_type
    `).all();
    const planTypes = typesResult.map(function(t) { return t.plan_type; });

    // 4. 整理成 12个月 × 类型 的数据结构
    var monthList = [];
    var series = [];

    for (var m = 1; m <= 12; m++) {
      monthList.push(m + '月');
    }

    // 初始化每个类型的月度数据
    for (var t = 0; t < planTypes.length; t++) {
      var typeName = planTypes[t];
      var typeData = {
        name: typeName,
        type: 'bar',
        data: []
      };
      for (var m = 1; m <= 12; m++) {
        typeData.data.push(0);
      }
      series.push(typeData);
    }

    // 填充预计完成数据（负数，因为是"流出"）
    expectedByType.forEach(function(item) {
      var typeIdx = planTypes.indexOf(item.plan_type);
      if (typeIdx >= 0 && item.month >= 1 && item.month <= 12) {
        // 预计完成作为基础值，不直接显示，而是计算差值
        // 这里我们直接存储差值
      }
    });

    // 计算每月每类型的差值（计划完成 - 预计完成）
    // 先建一个 map 存预计和计划的数据
    var expectedMap = {};
    var plannedMap = {};
    
    expectedByType.forEach(function(item) {
      var key = item.month + '_' + item.plan_type;
      expectedMap[key] = item.count;
    });
    plannedByType.forEach(function(item) {
      var key = item.month + '_' + item.plan_type;
      plannedMap[key] = item.count;
    });

    // 填充差值到 series
    for (var tIdx = 0; tIdx < planTypes.length; tIdx++) {
      var typeName = planTypes[tIdx];
      for (var mIdx = 0; mIdx < 12; mIdx++) {
        var monthNum = mIdx + 1;
        var key = monthNum + '_' + typeName;
        var exp = expectedMap[key] || 0;
        var pla = plannedMap[key] || 0;
        series[tIdx].data[mIdx] = pla - exp;
      }
    }

    // 计算汇总数据
    var totalExpected = 0;
    var totalPlanned = 0;
    var delayedCount = 0;
    var advancedCount = 0;

    // 计算每个计划的延期/提前情况（需要逐条计划判断）
    var allPlans = db.prepare(`
      SELECT plan_type, expected_finish_date, plan_finish_date
      FROM business_plan
      WHERE expected_finish_date IS NOT NULL 
        AND expected_finish_date != ''
        AND plan_finish_date IS NOT NULL 
        AND plan_finish_date != ''
        AND strftime('%Y', expected_finish_date) = ?
    `).all(currentYear.toString());

    allPlans.forEach(function(plan) {
      totalExpected++;
      if (plan.plan_finish_date > plan.expected_finish_date) {
        delayedCount++;
      } else if (plan.plan_finish_date < plan.expected_finish_date) {
        advancedCount++;
      }
    });

    // 统计计划完成的总数
    var plannedTotal = db.prepare(`
      SELECT COUNT(*) as count
      FROM business_plan
      WHERE plan_finish_date IS NOT NULL 
        AND plan_finish_date != ''
        AND strftime('%Y', plan_finish_date) = ?
    `).get(currentYear.toString());
    totalPlanned = plannedTotal ? plannedTotal.count : 0;

    var result = {
      year: currentYear,
      months: monthList,
      plan_types: planTypes,
      series: series,
      summary: {
        total_expected: totalExpected,
        total_planned: totalPlanned,
        delayed_count: delayedCount,
        advanced_count: advancedCount,
        delay_rate: totalExpected > 0 ? ((delayedCount / totalExpected) * 100).toFixed(1) + '%' : '0%'
      }
    };

    return success(res, result);
  }

  // 默认：不按类型分组，总计月度差值（原有逻辑）
  // 统计每个月的预计完成数量
  const expectedStats = db.prepare(`
    SELECT 
      CAST(strftime('%m', expected_finish_date) AS INTEGER) as month,
      COUNT(*) as count
    FROM business_plan
    WHERE expected_finish_date IS NOT NULL 
      AND expected_finish_date != ''
      AND strftime('%Y', expected_finish_date) = ?
    GROUP BY strftime('%m', expected_finish_date)
    ORDER BY month
  `).all(currentYear.toString());

  // 统计每个月的计划完成数量
  const plannedStats = db.prepare(`
    SELECT 
      CAST(strftime('%m', plan_finish_date) AS INTEGER) as month,
      COUNT(*) as count
    FROM business_plan
    WHERE plan_finish_date IS NOT NULL 
      AND plan_finish_date != ''
      AND strftime('%Y', plan_finish_date) = ?
    GROUP BY strftime('%m', plan_finish_date)
    ORDER BY month
  `).all(currentYear.toString());

  // 整理成 1-12 月的数据
  const months = [];
  const expectedData = [];
  const plannedData = [];
  const diffData = [];

  for (var m = 1; m <= 12; m++) {
    months.push(m + '月');
    
    var exp = expectedStats.find(function(s) { return s.month === m; });
    var expCount = exp ? exp.count : 0;
    expectedData.push(expCount);
    
    var pla = plannedStats.find(function(s) { return s.month === m; });
    var plaCount = pla ? pla.count : 0;
    plannedData.push(plaCount);
    
    diffData.push(plaCount - expCount);
  }

  // 计算汇总指标
  var totalExpected = expectedData.reduce(function(a, b) { return a + b; }, 0);
  var totalPlanned = plannedData.reduce(function(a, b) { return a + b; }, 0);
  
  // 计算延期计划数量（计划完成月份 > 预计完成月份的计划数）
  var delayedCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM business_plan
    WHERE expected_finish_date IS NOT NULL 
      AND expected_finish_date != ''
      AND plan_finish_date IS NOT NULL 
      AND plan_finish_date != ''
      AND plan_finish_date > expected_finish_date
      AND strftime('%Y', expected_finish_date) = ?
  `).get(currentYear.toString());
  
  var advancedCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM business_plan
    WHERE expected_finish_date IS NOT NULL 
      AND expected_finish_date != ''
      AND plan_finish_date IS NOT NULL 
      AND plan_finish_date != ''
      AND plan_finish_date < expected_finish_date
      AND strftime('%Y', expected_finish_date) = ?
  `).get(currentYear.toString());

  var result = {
    year: currentYear,
    months: months,
    expected_count: expectedData,
    planned_count: plannedData,
    diff_count: diffData,
    summary: {
      total_expected: totalExpected,
      total_planned: totalPlanned,
      delayed_count: delayedCount ? delayedCount.count : 0,
      advanced_count: advancedCount ? advancedCount.count : 0,
      delay_rate: totalExpected > 0 ? ((delayedCount.count / totalExpected) * 100).toFixed(1) + '%' : '0%'
    }
  };

  return success(res, result);
});

module.exports = router;
