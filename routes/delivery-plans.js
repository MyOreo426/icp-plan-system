/**
 * 交付计划路由
 * 处理交付计划的CRUD、导入导出、数据清除等操作
 */

const express = require('express');
const { getDb } = require('../db/init');
const { authenticate, requireRole } = require('../middleware/auth');
const { success, error, paginate } = require('../utils/response');

const router = express.Router();

// 所有路由都需要认证
router.use(authenticate);

/**
 * GET /api/delivery-plans
 * 获取交付计划列表（支持分页、筛选）
 */
router.get('/', (req, res) => {
  const db = getDb();
  const {
    page = 1, pageSize = 20,
    product_no, product_name, user_name,
    batch_no, current_progress
  } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  // 构建查询条件
  let whereClause = 'WHERE 1=1';
  const params = [];

  if (product_no) {
    whereClause += ' AND product_no LIKE ?';
    params.push(`%${product_no}%`);
  }
  if (product_name) {
    whereClause += ' AND product_name LIKE ?';
    params.push(`%${product_name}%`);
  }
  if (user_name) {
    whereClause += ' AND user_name LIKE ?';
    params.push(`%${user_name}%`);
  }
  if (batch_no) {
    whereClause += ' AND batch_no LIKE ?';
    params.push(`%${batch_no}%`);
  }
  if (current_progress) {
    whereClause += ' AND current_progress LIKE ?';
    params.push(`%${current_progress}%`);
  }

  // 查询总数
  const countResult = db.prepare(`
    SELECT COUNT(*) as total
    FROM delivery_plan
    ${whereClause}
  `).get(...params);

  // 查询列表
  const plans = db.prepare(`
    SELECT *
    FROM delivery_plan
    ${whereClause}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);

  return paginate(res, plans, countResult.total, page, pageSize);
});

/**
 * GET /api/delivery-plans/all
 * 获取所有交付计划（不分页）
 */
router.get('/all', (req, res) => {
  const db = getDb();
  const { product_no, product_name, user_name, batch_no, current_progress } = req.query;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (product_no) {
    whereClause += ' AND product_no LIKE ?';
    params.push(`%${product_no}%`);
  }
  if (product_name) {
    whereClause += ' AND product_name LIKE ?';
    params.push(`%${product_name}%`);
  }
  if (user_name) {
    whereClause += ' AND user_name LIKE ?';
    params.push(`%${user_name}%`);
  }
  if (batch_no) {
    whereClause += ' AND batch_no LIKE ?';
    params.push(`%${batch_no}%`);
  }
  if (current_progress) {
    whereClause += ' AND current_progress LIKE ?';
    params.push(`%${current_progress}%`);
  }

  const plans = db.prepare(`
    SELECT *
    FROM delivery_plan
    ${whereClause}
    ORDER BY id DESC
  `).all(...params);

  return success(res, plans);
});

/**
 * POST /api/delivery-plans/import
 * 批量导入交付计划（Excel导入）
 */
router.post('/import', requireRole('LEADER', 'DIRECTOR', 'ADMIN'), (req, res) => {
  const db = getDb();
  const { plans } = req.body;

  if (!Array.isArray(plans) || plans.length === 0) {
    return error(res, 400, '请提供交付计划数据数组');
  }

  if (plans.length > 2000) {
    return error(res, 400, '单次导入不超过2000条');
  }

  const results = { success: 0, failed: 0, errors: [] };

  // 字段映射表：支持多种中文表头
  const fieldMappings = {
    product_no: ['产品编号', '产品号', 'product_no', 'productNo'],
    product_name: ['产品名称', '名称', 'product_name', 'productName'],
    user_name: ['用户', '使用方', '客户', 'user_name', 'userName'],
    batch_no: ['批次', '批次号', 'batch_no', 'batchNo'],
    sortie_no: ['架次', '架次号', 'sortie_no', 'sortieNo'],
    assign_command: ['分配命令', '分配指令', 'assign_command', 'assignCommand'],
    outline_plan: ['大纲计划', '大纲', 'outline_plan', 'outlinePlan'],
    research_transfer_plan: ['科研转场计划', '科研转场', 'research_transfer_plan', 'researchTransferPlan'],
    lead_seal: ['铅封', 'lead_seal', 'leadSeal'],
    enter_acceptance: ['进入接装', '接装', 'enter_acceptance', 'enterAcceptance'],
    test_flight: ['检飞', '试飞', 'test_flight', 'testFlight'],
    transfer_test: ['转试', 'transfer_test', 'transferTest'],
    transfer_field: ['转场', 'transfer_field', 'transferField'],
    yh_plane_no: ['YH机号', 'YH号', 'yh_plane_no', 'yhPlaneNo'],
    current_progress: ['当前进度', '进度', 'current_progress', 'currentProgress'],
    transfer_cycle: ['转场周期', '周期', 'transfer_cycle', 'transferCycle'],
    acceptance_issue_count: ['接装问题数', '问题数', 'acceptance_issue_count', 'acceptanceIssueCount'],
    memo_count: ['备忘录数', '备忘数', 'memo_count', 'memoCount'],
    remark: ['备注', '说明', 'remark']
  };

  function getFieldValue(item, fieldName) {
    const aliases = fieldMappings[fieldName];
    for (let i = 0; i < aliases.length; i++) {
      if (item[aliases[i]] !== undefined && item[aliases[i]] !== null) {
        return item[aliases[i]];
      }
    }
    return undefined;
  }

  plans.forEach((item, index) => {
    try {
      const productNo = getFieldValue(item, 'product_no');
      const productName = getFieldValue(item, 'product_name');
      const userName = getFieldValue(item, 'user_name');
      const batchNo = getFieldValue(item, 'batch_no');
      const sortieNo = getFieldValue(item, 'sortie_no');
      const assignCommand = getFieldValue(item, 'assign_command');
      const outlinePlan = getFieldValue(item, 'outline_plan');
      const researchTransferPlan = getFieldValue(item, 'research_transfer_plan');
      const leadSeal = getFieldValue(item, 'lead_seal');
      const enterAcceptance = getFieldValue(item, 'enter_acceptance');
      const testFlight = getFieldValue(item, 'test_flight');
      const transferTest = getFieldValue(item, 'transfer_test');
      const transferField = getFieldValue(item, 'transfer_field');
      const yhPlaneNo = getFieldValue(item, 'yh_plane_no');
      const currentProgress = getFieldValue(item, 'current_progress');
      const transferCycle = getFieldValue(item, 'transfer_cycle');
      let acceptanceIssueCount = getFieldValue(item, 'acceptance_issue_count');
      let memoCount = getFieldValue(item, 'memo_count');
      const remark = getFieldValue(item, 'remark');

      // 处理数字字段
      if (acceptanceIssueCount === '' || acceptanceIssueCount === null || acceptanceIssueCount === undefined) {
        acceptanceIssueCount = 0;
      } else {
        acceptanceIssueCount = parseInt(acceptanceIssueCount) || 0;
      }
      if (memoCount === '' || memoCount === null || memoCount === undefined) {
        memoCount = 0;
      } else {
        memoCount = parseInt(memoCount) || 0;
      }

      db.prepare(`
        INSERT INTO delivery_plan (
          product_no, product_name, user_name, batch_no, sortie_no,
          assign_command, outline_plan, research_transfer_plan,
          lead_seal, enter_acceptance, test_flight, transfer_test,
          transfer_field, yh_plane_no, current_progress, transfer_cycle,
          acceptance_issue_count, memo_count, remark, creator_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        productNo || null,
        productName || null,
        userName || null,
        batchNo || null,
        sortieNo || null,
        assignCommand || null,
        outlinePlan || null,
        researchTransferPlan || null,
        leadSeal || null,
        enterAcceptance || null,
        testFlight || null,
        transferTest || null,
        transferField || null,
        yhPlaneNo || null,
        currentProgress || null,
        transferCycle || null,
        acceptanceIssueCount,
        memoCount,
        remark || null,
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
    VALUES (?, ?, 'IMPORT', 'DELIVERY_PLAN', NULL, NULL, ?, ?, ?)
  `).run(
    req.user.id, req.user.real_name,
    JSON.stringify({ total: plans.length, success: results.success, failed: results.failed }),
    req.ip, req.headers['user-agent'] || ''
  );

  return success(res, results, `导入完成：成功${results.success}条，失败${results.failed}条`);
});

/**
 * POST /api/delivery-plans/clear
 * 物理删除全部交付计划数据
 */
router.post('/clear', requireRole('DIRECTOR', 'ADMIN'), (req, res) => {
  const db = getDb();

  // 先统计数量
  const countResult = db.prepare('SELECT COUNT(*) as total FROM delivery_plan').get();

  // 物理删除全部
  db.prepare('DELETE FROM delivery_plan').run();

  // 记录操作日志
  db.prepare(`
    INSERT INTO sys_operation_log
    (user_id, username, operation_type, target_type, target_id, before_data, after_data, ip_address, user_agent)
    VALUES (?, ?, 'DELETE', 'DELIVERY_PLAN_CLEAR', NULL, ?, NULL, ?, ?)
  `).run(
    req.user.id, req.user.real_name,
    JSON.stringify({ cleared_count: countResult.total }),
    req.ip, req.headers['user-agent'] || ''
  );

  return success(res, { cleared_count: countResult.total }, `已清除${countResult.total}条交付计划数据`);
});

module.exports = router;

/**
 * GET /api/delivery-plans/stats/outline-by-month
 * 按月+产品类型统计大纲计划数量（用于柱状图）
 */
router.get('/stats/outline-by-month', (req, res) => {
  const db = getDb();
  const { year } = req.query;
  const targetYear = year || new Date().getFullYear();

  const plans = db.prepare(`
    SELECT 
      product_no,
      product_name,
      outline_plan,
      SUBSTR(REPLACE(outline_plan, '/', '-'), 1, 4) as plan_year,
      SUBSTR(REPLACE(outline_plan, '/', '-'), 6, 2) as plan_month
    FROM delivery_plan
    WHERE outline_plan IS NOT NULL 
      AND outline_plan != ''
      AND SUBSTR(REPLACE(outline_plan, '/', '-'), 1, 4) = ?
    ORDER BY plan_month
  `).all(targetYear.toString());

  const monthData = {};
  const productTypes = new Set();

  for (let m = 1; m <= 12; m++) {
    monthData[m.toString().padStart(2, '0')] = {};
  }

  plans.forEach(plan => {
    const month = plan.plan_month;
    let productType = '其他';
    if (plan.product_no) {
      const match = plan.product_no.match(/^[A-Za-z0-9]+/);
      if (match) {
        productType = match[0].substring(0, 4).toUpperCase();
      }
    }
    if (plan.product_name && plan.product_name.length <= 6) {
      productType = plan.product_name;
    }
    
    productTypes.add(productType);
    
    if (monthData[month]) {
      if (!monthData[month][productType]) {
        monthData[month][productType] = 0;
      }
      monthData[month][productType]++;
    }
  });

  const months = [];
  for (let m = 1; m <= 12; m++) {
    months.push(m + '月');
  }

  const sortedTypes = Array.from(productTypes).sort();
  const series = sortedTypes.map(type => {
    const data = [];
    for (let m = 1; m <= 12; m++) {
      const mStr = m.toString().padStart(2, '0');
      data.push((monthData[mStr] && monthData[mStr][type]) || 0);
    }
    return {
      name: type,
      type: 'bar',
      data: data
    };
  });

  return success(res, {
    months: months,
    productTypes: sortedTypes,
    series: series,
    total: plans.length
  });
});

/**
 * GET /api/delivery-plans/stats/research-transfer-by-month
 * 按月+产品类型统计科研转场计划完成情况（用于柱状图）
 */
router.get('/stats/research-transfer-by-month', (req, res) => {
  const db = getDb();
  const { year } = req.query;
  const targetYear = year || new Date().getFullYear();

  const plans = db.prepare(`
    SELECT 
      product_no,
      product_name,
      research_transfer_plan,
      current_progress,
      SUBSTR(REPLACE(research_transfer_plan, '/', '-'), 1, 4) as plan_year,
      SUBSTR(REPLACE(research_transfer_plan, '/', '-'), 6, 2) as plan_month
    FROM delivery_plan
    WHERE research_transfer_plan IS NOT NULL 
      AND research_transfer_plan != ''
      AND SUBSTR(REPLACE(research_transfer_plan, '/', '-'), 1, 4) = ?
    ORDER BY plan_month
  `).all(targetYear.toString());

  const monthData = {};
  const productTypes = new Set();

  for (let m = 1; m <= 12; m++) {
    monthData[m.toString().padStart(2, '0')] = {};
  }

  plans.forEach(plan => {
    const month = plan.plan_month;
    let productType = '其他';
    if (plan.product_no) {
      const match = plan.product_no.match(/^[A-Za-z0-9]+/);
      if (match) {
        productType = match[0].substring(0, 4).toUpperCase();
      }
    }
    if (plan.product_name && plan.product_name.length <= 6) {
      productType = plan.product_name;
    }
    
    productTypes.add(productType);
    
    if (monthData[month]) {
      if (!monthData[month][productType]) {
        monthData[month][productType] = 0;
      }
      monthData[month][productType]++;
    }
  });

  const months = [];
  for (let m = 1; m <= 12; m++) {
    months.push(m + '月');
  }

  const sortedTypes = Array.from(productTypes).sort();
  const series = sortedTypes.map(type => {
    const data = [];
    for (let m = 1; m <= 12; m++) {
      const mStr = m.toString().padStart(2, '0');
      data.push((monthData[mStr] && monthData[mStr][type]) || 0);
    }
    return {
      name: type,
      type: 'bar',
      data: data
    };
  });

  return success(res, {
    months: months,
    productTypes: sortedTypes,
    series: series,
    total: plans.length
  });
});

/**
 * GET /api/delivery-plans/stats/summary
 * 交付计划汇总统计（用于顶部卡片）
 */
router.get('/stats/summary', (req, res) => {
  const db = getDb();
  const currentYear = new Date().getFullYear();

  const totalResult = db.prepare('SELECT COUNT(*) as total FROM delivery_plan').get();
  
  const outlineResult = db.prepare(`
    SELECT COUNT(*) as count
    FROM delivery_plan
    WHERE outline_plan IS NOT NULL AND outline_plan != ''
      AND SUBSTR(REPLACE(outline_plan, '/', '-'), 1, 4) = ?
  `).get(currentYear.toString());
  
  const researchResult = db.prepare(`
    SELECT COUNT(*) as count
    FROM delivery_plan
    WHERE research_transfer_plan IS NOT NULL AND research_transfer_plan != ''
      AND SUBSTR(REPLACE(research_transfer_plan, '/', '-'), 1, 4) = ?
  `).get(currentYear.toString());

  const typeResult = db.prepare(`
    SELECT COUNT(DISTINCT product_no) as count
    FROM delivery_plan
    WHERE product_no IS NOT NULL AND product_no != ''
  `).get();

  return success(res, {
    total: (totalResult && totalResult.total) || 0,
    yearOutlineCount: (outlineResult && outlineResult.count) || 0,
    yearResearchTransferCount: (researchResult && researchResult.count) || 0,
    productTypeCount: (typeResult && typeResult.count) || 0,
    year: currentYear
  });
});
