/**
 * 数据库初始化模块
 * 使用 sql.js (WebAssembly SQLite) 替代 better-sqlite3
 * 提供兼容 better-sqlite3 API 的包装层
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// 数据库文件路径
const DB_PATH = path.join(__dirname, '..', 'data', 'icp.db');

let dbInstance = null;           // sql.js Database 实例
let wrapperInstance = null;     // 包装后的数据库实例
let dbReadyPromise = null;       // 初始化 Promise

/**
 * sql.js Database 包装类
 * 提供与 better-sqlite3 兼容的 API
 */
class SqlJsWrapper {
  constructor(database) {
    this.db = database;
    this.dbPath = DB_PATH;
  }

  /**
   * 保存数据库到文件
   */
  saveToFile() {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error('保存数据库文件失败:', err);
    }
  }

  /**
   * 准备一条 SQL 语句
   * 返回一个 Statement 包装对象
   */
  prepare(sql) {
    const self = this;
    const db = this.db;

    return {
      /**
       * 执行查询，返回第一行
       * @returns {Object|undefined} 行对象或 undefined
       */
      get(...params) {
        try {
          const stmt = db.prepare(sql);
          if (params.length > 0) {
            stmt.bind(params);
          }

          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          } else {
            stmt.free();
            return undefined;
          }
        } catch (err) {
          console.error('SQL get error:', sql, params, err);
          return undefined;
        }
      },

      /**
       * 执行查询，返回所有行
       * @returns {Array} 行对象数组
       */
      all(...params) {
        try {
          const stmt = db.prepare(sql);
          if (params.length > 0) {
            stmt.bind(params);
          }

          const rows = [];
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          stmt.free();
          return rows;
        } catch (err) {
          console.error('SQL all error:', sql, params, err);
          return [];
        }
      },

      /**
       * 执行 INSERT/UPDATE/DELETE
       * @returns {Object} { lastInsertRowid, changes }
       */
      run(...params) {
        try {
          const stmt = db.prepare(sql);
          if (params.length > 0) {
            stmt.bind(params);
          }
          stmt.step();
          stmt.free();

          // 获取 lastInsertRowid
          let lastInsertRowid = 0;
          const idStmt = db.prepare('SELECT last_insert_rowid() as id');
          if (idStmt.step()) {
            lastInsertRowid = idStmt.getAsObject().id;
            idStmt.free();
          }

          // 获取 changes
          const changesStmt = db.prepare('SELECT changes() as changes');
          let changes = 0;
          if (changesStmt.step()) {
            changes = changesStmt.getAsObject().changes;
            changesStmt.free();
          }

          // 自动保存到文件
          self.saveToFile();

          return { lastInsertRowid, changes };
        } catch (err) {
          console.error('SQL run error:', sql, params, err);
          return { lastInsertRowid: 0, changes: 0 };
        }
      }
    };
  }

  /**
   * 执行多条 SQL
   */
  exec(sql) {
    try {
      this.db.run(sql);
      this.saveToFile();
    } catch (err) {
      console.error('SQL exec error:', sql, err);
    }
  }

  /**
   * 执行带参数的 SQL（便捷方法）
   */
  run(sql, params = []) {
    try {
      this.db.run(sql, params);
      this.saveToFile();
    } catch (err) {
      console.error('SQL run error:', sql, params, err);
    }
  }
}

/**
 * 初始化数据库
 * @returns {Promise} 初始化完成 Promise
 */
async function initDatabase() {
  if (dbReadyPromise) {
    return dbReadyPromise;
  }

  dbReadyPromise = (async () => {
    console.log('正在初始化 sql.js...');

    // 初始化 sql.js
    const SQL = await initSqlJs();

    // 尝试从文件加载数据库
    let database;
    if (fs.existsSync(DB_PATH)) {
      try {
        const fileBuffer = fs.readFileSync(DB_PATH);
        database = new SQL.Database(fileBuffer);
        console.log('已从文件加载数据库:', DB_PATH);
      } catch (err) {
        console.log('加载数据库文件失败，创建新数据库:', err.message);
        database = new SQL.Database();
      }
    } else {
      database = new SQL.Database();
      console.log('创建新的数据库');
    }

    dbInstance = database;
    wrapperInstance = new SqlJsWrapper(database);

    // 启用外键约束
    database.run('PRAGMA foreign_keys = ON');

    console.log('开始初始化数据库表结构...');

    // 创建用户表
    database.run(`
      CREATE TABLE IF NOT EXISTS sys_user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(6) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        real_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        role VARCHAR(20) NOT NULL CHECK(role IN ('MEMBER', 'LEADER', 'DIRECTOR', 'ADMIN')),
        group_id INTEGER,
        status INTEGER NOT NULL DEFAULT 1,
        must_change_password INTEGER DEFAULT 0,
        failed_login_attempts INTEGER DEFAULT 0,
        lock_until DATETIME,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME,
        FOREIGN KEY (group_id) REFERENCES sys_group(id)
      )
    `);
    console.log('✓ sys_user 表创建完成');

    // 创建小组表
    database.run(`
      CREATE TABLE IF NOT EXISTS sys_group (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_name VARCHAR(100) NOT NULL,
        department VARCHAR(100),
        leader_id INTEGER,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (leader_id) REFERENCES sys_user(id)
      )
    `);
    console.log('✓ sys_group 表创建完成');

    // 创建内控计划表
    database.run(`
      CREATE TABLE IF NOT EXISTS icp_plan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seq_no INTEGER NOT NULL,
        category VARCHAR(100) NOT NULL,
        project VARCHAR(200),
        action_item VARCHAR(200) NOT NULL,
        plan_source VARCHAR(200),
        deliverable TEXT,
        responsible_id INTEGER,
        plan_issue_date DATE,
        plan_deadline DATE NOT NULL,
        current_progress TEXT,
        is_overdue INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'IN_PROGRESS', 'CLOSED', 'CONTINUOUS')),
        remark TEXT,
        creator_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        is_locked INTEGER NOT NULL DEFAULT 0,
        lock_by INTEGER,
        lock_time DATETIME,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME,
        FOREIGN KEY (responsible_id) REFERENCES sys_user(id),
        FOREIGN KEY (creator_id) REFERENCES sys_user(id),
        FOREIGN KEY (group_id) REFERENCES sys_group(id),
        FOREIGN KEY (lock_by) REFERENCES sys_user(id)
      )
    `);
    console.log('✓ icp_plan 表创建完成');

    // 创建操作日志表
    database.run(`
      CREATE TABLE IF NOT EXISTS sys_operation_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username VARCHAR(50),
        operation_type VARCHAR(20) NOT NULL CHECK(operation_type IN ('CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT', 'LOGIN', 'LOGOUT')),
        target_type VARCHAR(50),
        target_id INTEGER,
        before_data TEXT,
        after_data TEXT,
        ip_address VARCHAR(50),
        user_agent VARCHAR(500),
        operation_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ sys_operation_log 表创建完成');

    // 创建消息通知表
    database.run(`
      CREATE TABLE IF NOT EXISTS sys_notification (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type VARCHAR(30) NOT NULL CHECK(type IN ('PLAN_MODIFIED', 'PLAN_EXPIRING')),
        title VARCHAR(200) NOT NULL,
        content TEXT,
        plan_id INTEGER,
        is_read INTEGER NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES sys_user(id),
        FOREIGN KEY (plan_id) REFERENCES icp_plan(id)
      )
    `);
    console.log('✓ sys_notification 表创建完成');

    // 创建登录尝试表
    database.run(`
      CREATE TABLE IF NOT EXISTS sys_login_attempt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(6) NOT NULL,
        attempt_count INTEGER DEFAULT 1,
        lock_until DATETIME,
        last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ sys_login_attempt 表创建完成');

    // 插入种子数据
    insertSeedData(wrapperInstance);

    // 保存到文件
    const data = database.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));

    console.log('数据库初始化完成！');
  })();

  return dbReadyPromise;
}

/**
 * 插入种子数据
 * @param {SqlJsWrapper} db - 数据库包装实例
 */
function insertSeedData(db) {
  // 检查是否已有数据
  const userCount = db.prepare('SELECT COUNT(*) as count FROM sys_user').get();
  if (userCount && userCount.count > 0) {
    console.log('种子数据已存在，跳过插入');
    return;
  }

  console.log('开始插入种子数据...');

  // 1. 创建管理员
  const adminPassword = bcrypt.hashSync('admin123', 10);
  const admin = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('000000', adminPassword, '系统管理员', 'admin@example.com', 'ADMIN', 1);
  console.log('✓ 创建管理员: 工号000000, 密码admin123');

  // 2. 创建测试小组
  const group = db.prepare(`
    INSERT INTO sys_group (group_name, department, status)
    VALUES (?, ?, ?)
  `).run('测试一组', '测试部', 1);
  console.log('✓ 创建测试小组: 测试一组');

  // 3. 创建测试组长
  const leaderPassword = bcrypt.hashSync('leader123', 10);
  const leader = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('100001', leaderPassword, '张组长', 'leader@example.com', 'LEADER', group.lastInsertRowid, 1);
  console.log('✓ 创建测试组长: 工号100001, 密码leader123');

  // 更新小组的leader_id
  db.prepare('UPDATE sys_group SET leader_id = ? WHERE id = ?').run(leader.lastInsertRowid, group.lastInsertRowid);

  // 4. 创建测试组员
  const memberPassword = bcrypt.hashSync('member123', 10);
  const member = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('100002', memberPassword, '李组员', 'member@example.com', 'MEMBER', group.lastInsertRowid, 1);
  console.log('✓ 创建测试组员: 工号100002, 密码member123');

  // 5. 创建测试主任
  const directorPassword = bcrypt.hashSync('director123', 10);
  db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('200001', directorPassword, '王主任', 'director@example.com', 'DIRECTOR', 1);
  console.log('✓ 创建测试主任: 工号200001, 密码director123');

  // 6. 插入测试内控计划数据
  const today = new Date().toISOString().split('T')[0];
  const overdueDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // 计划1：正常进行中
  db.prepare(`
    INSERT INTO icp_plan (
      seq_no, category, project, action_item, plan_source, deliverable,
      responsible_id, plan_issue_date, plan_deadline, current_progress,
      status, creator_id, group_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    1, '合规检查', '内控优化项目', '完善采购流程', '年度计划',
    '采购管理制度v2.0', leader.lastInsertRowid, today, futureDate,
    '已完成初稿，正在内部评审', 'IN_PROGRESS', leader.lastInsertRowid, group.lastInsertRowid
  );

  // 计划2：已超期（风险评估→风控二组）
  // 注：leader2和group2在下方扩充数据中创建，此处用占位，在扩充数据创建后再插入
  // 先记录计划2的参数，等leader2/group2创建后再插入
  let plan2Pending = true;

  console.log('✓ 插入1条测试内控计划数据（计划2待风控二组创建后插入）');

  // ===== 扩充种子数据：额外小组、用户和50条计划 =====

  // 7. 创建风控二组
  const group2 = db.prepare(`
    INSERT INTO sys_group (group_name, department, status)
    VALUES (?, ?, ?)
  `).run('风控二组', '风险管理部', 1);
  console.log('✓ 创建小组: 风控二组');

  // 8. 创建风控二组组长
  const leader2 = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('100003', leaderPassword, '刘组长', 'leader2@example.com', 'LEADER', group2.lastInsertRowid, 1);
  db.prepare('UPDATE sys_group SET leader_id = ? WHERE id = ?').run(leader2.lastInsertRowid, group2.lastInsertRowid);
  console.log('✓ 创建风控二组组长: 工号100003, 密码leader123');

  // 9. 创建风控二组组员
  const member2a = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('100004', memberPassword, '陈组员', 'member2a@example.com', 'MEMBER', group2.lastInsertRowid, 1);
  const member2b = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('100005', memberPassword, '赵组员', 'member2b@example.com', 'MEMBER', group2.lastInsertRowid, 1);
  console.log('✓ 创建风控二组组员: 工号100004/100005, 密码member123');

  // 插入计划2：风险评估→风控二组（已超期）
  if (plan2Pending) {
    db.prepare(`
      INSERT INTO icp_plan (
        seq_no, category, project, action_item, plan_source, deliverable,
        responsible_id, plan_issue_date, plan_deadline, current_progress,
        status, is_overdue, creator_id, group_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      2, '风险评估', '风险管理体系', '更新风险清单', '季度审计',
      '风险评估报告', leader2.lastInsertRowid, new Date().toISOString().split('T')[0],
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      '数据收集阶段', 'IN_PROGRESS', 1, leader2.lastInsertRowid, group2.lastInsertRowid
    );
    plan2Pending = false;
    console.log('✓ 补插计划2（风险评估→风控二组）');
  }

  // 10. 创建审计三组
  const group3 = db.prepare(`
    INSERT INTO sys_group (group_name, department, status)
    VALUES (?, ?, ?)
  `).run('审计三组', '审计部', 1);
  console.log('✓ 创建小组: 审计三组');

  // 11. 创建审计三组组长
  const leader3 = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('100006', leaderPassword, '周组长', 'leader3@example.com', 'LEADER', group3.lastInsertRowid, 1);
  db.prepare('UPDATE sys_group SET leader_id = ? WHERE id = ?').run(leader3.lastInsertRowid, group3.lastInsertRowid);
  console.log('✓ 创建审计三组组长: 工号100006, 密码leader123');

  // 12. 创建审计三组组员
  const member3a = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('100007', memberPassword, '吴组员', 'member3a@example.com', 'MEMBER', group3.lastInsertRowid, 1);
  const member3b = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('100008', memberPassword, '郑组员', 'member3b@example.com', 'MEMBER', group3.lastInsertRowid, 1);
  console.log('✓ 创建审计三组组员: 工号100007/100008, 密码member123');

  // ===== 插入50条计划数据 =====
  // 日期辅助函数
  function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  // 所有用户ID（用于分配责任人）- 按小组分组
  const group1Users = [leader.lastInsertRowid, member.lastInsertRowid];          // 测试一组：张组长、李组员
  const group2Users = [leader2.lastInsertRowid, member2a.lastInsertRowid, member2b.lastInsertRowid];  // 风控二组：刘组长、陈组员、赵组员
  const group3Users = [leader3.lastInsertRowid, member3a.lastInsertRowid, member3b.lastInsertRowid];  // 审计三组：周组长、吴组员、郑组员
  const allGroupIds = [group.lastInsertRowid, group2.lastInsertRowid, group3.lastInsertRowid];

  // 类别→小组映射：每个类别的责任人属于同一小组
  // 合规检查→测试一组, 风险评估→风控二组, 信息安全→风控二组, 内部审计→审计三组, 流程优化→测试一组, 培训教育→审计三组
  const categoryGroupMap = {
    '合规检查': { users: group1Users, groupId: allGroupIds[0] },
    '风险评估': { users: group2Users, groupId: allGroupIds[1] },
    '信息安全': { users: group2Users, groupId: allGroupIds[1] },
    '内部审计': { users: group3Users, groupId: allGroupIds[2] },
    '流程优化': { users: group1Users, groupId: allGroupIds[0] },
    '培训教育': { users: group3Users, groupId: allGroupIds[2] }
  };

  const categories = ['合规检查', '风险评估', '信息安全', '内部审计', '流程优化', '培训教育'];
  const projects = {
    '合规检查': ['内控优化项目', '合规管理体系', '监管报送整改', '制度合规审查'],
    '风险评估': ['风险管理体系', '操作风险评估', '信用风险排查', '市场风险监控'],
    '信息安全': ['信息安全体系', '数据安全治理', '网络安全加固', '等保合规项目'],
    '内部审计': ['年度审计项目', '专项审计检查', '整改跟踪项目', '审计质量提升'],
    '流程优化': ['流程优化项目', '自动化改造', '效能提升计划', '数字化转型'],
    '培训教育': ['合规培训项目', '风控能力建设', '岗位资格培训', '文化建设']
  };
  const sources = ['年度计划', '季度审计', '监管要求', '内部整改', '专项检查', '领导交办'];
  const deliverables = ['管理制度', '评估报告', '检查报告', '培训方案', '整改方案', '操作手册', '分析报告', '审查意见'];
  const progresses = [
    '尚未启动', '需求收集中', '方案制定中', '数据收集阶段', '初稿编写中',
    '已完成初稿，正在内部评审', '评审已通过，待领导审批', '审批中',
    '执行中，进度30%', '执行中，进度50%', '执行中，进度70%', '执行中，进度90%',
    '已完成待归档', '持续跟踪中', '定期更新中'
  ];
  const statuses = ['PENDING', 'IN_PROGRESS', 'CLOSED', 'CONTINUOUS'];

  // 计划数据模板（50条，覆盖各类别/状态/超期/预警）
  const planTemplates = [
    // 合规检查（11条）
    { cat: 0, proj: 0, action: '完善采购流程', src: 0, del: 0, days: 15, status: 1, overdue: 0 },
    { cat: 0, proj: 1, action: '修订合规手册', src: 2, del: 6, days: -3, status: 1, overdue: 1 },
    { cat: 0, proj: 0, action: '合规培训方案制定', src: 0, del: 5, days: 5, status: 1, overdue: 0 },
    { cat: 0, proj: 2, action: '监管报送整改落实', src: 2, del: 2, days: -10, status: 1, overdue: 1 },
    { cat: 0, proj: 3, action: '制度合规审查', src: 4, del: 7, days: 20, status: 0, overdue: 0 },
    { cat: 0, proj: 1, action: '反洗钱合规检查', src: 2, del: 2, days: 3, status: 1, overdue: 0 },
    { cat: 0, proj: 0, action: '关联交易合规审查', src: 5, del: 7, days: 45, status: 0, overdue: 0 },
    { cat: 0, proj: 2, action: '信息披露合规检查', src: 0, del: 2, days: -5, status: 2, overdue: 0 },
    { cat: 0, proj: 3, action: '新规适应性评估', src: 2, del: 6, days: 7, status: 1, overdue: 0 },
    { cat: 0, proj: 1, action: '合规文化建设', src: 5, del: 3, days: 60, status: 3, overdue: 0 },
    { cat: 0, proj: 0, action: '供应商合规审查', src: 4, del: 7, days: 2, status: 1, overdue: 0 },

    // 风险评估（10条）
    { cat: 1, proj: 0, action: '更新风险清单', src: 1, del: 1, days: -7, status: 1, overdue: 1 },
    { cat: 1, proj: 1, action: '操作风险识别评估', src: 0, del: 1, days: 10, status: 1, overdue: 0 },
    { cat: 1, proj: 2, action: '信用风险排查', src: 1, del: 6, days: 6, status: 1, overdue: 0 },
    { cat: 1, proj: 3, action: '市场风险监控机制', src: 3, del: 0, days: 25, status: 0, overdue: 0 },
    { cat: 1, proj: 0, action: '关键风险指标设定', src: 0, del: 6, days: -2, status: 1, overdue: 1 },
    { cat: 1, proj: 1, action: '风险偏好声明更新', src: 5, del: 1, days: 30, status: 0, overdue: 0 },
    { cat: 1, proj: 2, action: '压力测试方案', src: 1, del: 1, days: 1, status: 1, overdue: 0 },
    { cat: 1, proj: 0, action: '风险报告制度完善', src: 0, del: 5, days: -15, status: 2, overdue: 0 },
    { cat: 1, proj: 3, action: '风险数据治理', src: 3, del: 0, days: 40, status: 3, overdue: 0 },
    { cat: 1, proj: 1, action: '风险评估培训', src: 5, del: 3, days: 4, status: 1, overdue: 0 },

    // 信息安全（9条）
    { cat: 2, proj: 0, action: '信息安全制度修订', src: 0, del: 0, days: 12, status: 1, overdue: 0 },
    { cat: 2, proj: 1, action: '数据分类分级', src: 2, del: 6, days: -4, status: 1, overdue: 1 },
    { cat: 2, proj: 2, action: '网络安全渗透测试', src: 4, del: 2, days: 8, status: 0, overdue: 0 },
    { cat: 2, proj: 3, action: '等保三级测评', src: 2, del: 2, days: 3, status: 1, overdue: 0 },
    { cat: 2, proj: 0, action: '安全事件响应机制', src: 3, del: 0, days: -20, status: 2, overdue: 0 },
    { cat: 2, proj: 1, action: '数据脱敏方案', src: 0, del: 5, days: 15, status: 1, overdue: 0 },
    { cat: 2, proj: 2, action: '终端安全管理', src: 4, del: 0, days: 6, status: 1, overdue: 0 },
    { cat: 2, proj: 3, action: '安全意识培训', src: 5, del: 3, days: 50, status: 3, overdue: 0 },
    { cat: 2, proj: 0, action: '访问权限审查', src: 1, del: 7, days: 2, status: 1, overdue: 0 },

    // 内部审计（8条）
    { cat: 3, proj: 0, action: '年度审计计划执行', src: 0, del: 2, days: 20, status: 1, overdue: 0 },
    { cat: 3, proj: 1, action: '费用专项审计', src: 5, del: 2, days: -8, status: 1, overdue: 1 },
    { cat: 3, proj: 2, action: '审计问题整改跟踪', src: 3, del: 4, days: 5, status: 1, overdue: 0 },
    { cat: 3, proj: 3, action: '审计质量控制', src: 0, del: 0, days: 35, status: 0, overdue: 0 },
    { cat: 3, proj: 0, action: '经济责任审计', src: 1, del: 2, days: -12, status: 2, overdue: 0 },
    { cat: 3, proj: 1, action: 'IT系统审计', src: 4, del: 2, days: 7, status: 1, overdue: 0 },
    { cat: 3, proj: 2, action: '整改效果评估', src: 3, del: 6, days: 1, status: 1, overdue: 0 },
    { cat: 3, proj: 3, action: '审计方法论优化', src: 0, del: 5, days: 55, status: 3, overdue: 0 },

    // 流程优化（6条）
    { cat: 4, proj: 0, action: '审批流程优化', src: 5, del: 5, days: 10, status: 1, overdue: 0 },
    { cat: 4, proj: 1, action: '报表自动化', src: 0, del: 0, days: -6, status: 1, overdue: 1 },
    { cat: 4, proj: 2, action: '跨部门协作机制', src: 5, del: 0, days: 4, status: 1, overdue: 0 },
    { cat: 4, proj: 3, action: '数字化转型规划', src: 0, del: 5, days: 25, status: 0, overdue: 0 },
    { cat: 4, proj: 0, action: '流程合规性检查', src: 1, del: 7, days: -18, status: 2, overdue: 0 },
    { cat: 4, proj: 1, action: 'RPA流程改造', src: 0, del: 0, days: 40, status: 3, overdue: 0 },

    // 培训教育（6条）
    { cat: 5, proj: 0, action: '年度合规培训', src: 0, del: 3, days: 15, status: 1, overdue: 0 },
    { cat: 5, proj: 1, action: '风控能力提升培训', src: 5, del: 3, days: -9, status: 1, overdue: 1 },
    { cat: 5, proj: 2, action: '岗位资格认证', src: 2, del: 3, days: 7, status: 0, overdue: 0 },
    { cat: 5, proj: 3, action: '合规文化建设活动', src: 5, del: 3, days: 30, status: 1, overdue: 0 },
    { cat: 5, proj: 0, action: '新员工合规培训', src: 0, del: 3, days: -25, status: 2, overdue: 0 },
    { cat: 5, proj: 1, action: '持续教育体系', src: 0, del: 5, days: 50, status: 3, overdue: 0 }
  ];

  const insertPlan = db.prepare(`
    INSERT INTO icp_plan (
      seq_no, category, project, action_item, plan_source, deliverable,
      responsible_id, plan_issue_date, plan_deadline, current_progress,
      status, is_overdue, creator_id, group_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  planTemplates.forEach((t, idx) => {
    const cat = categories[t.cat];
    const mapping = categoryGroupMap[cat];
    const userIdx = idx % mapping.users.length;
    const userId = mapping.users[userIdx];
    const groupId = mapping.groupId;
    const proj = projects[cat][t.proj % projects[cat].length];
    const issueDate = daysFromNow(-Math.floor(Math.random() * 30 + 10));
    const deadline = daysFromNow(t.days);
    const progress = progresses[Math.floor(Math.random() * progresses.length)];

    insertPlan.run(
      idx + 3, cat, proj, t.action, sources[t.src], deliverables[t.del],
      userId, issueDate, deadline, progress,
      statuses[t.status], t.overdue, userId, groupId
    );
  });

  console.log('✓ 插入50条测试内控计划数据');
  console.log(`  合计：3小组/10用户/52条计划（含2条基础+50条扩充）`);
}

/**
 * 获取数据库实例
 * @returns {SqlJsWrapper} 包装后的数据库实例
 */
function getDb() {
  if (!wrapperInstance) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return wrapperInstance;
}

/**
 * 获取数据库就绪 Promise
 * @returns {Promise}
 */
function getDbReady() {
  return dbReadyPromise;
}

// 导出模块
module.exports = { initDatabase, getDb, getDbReady };
