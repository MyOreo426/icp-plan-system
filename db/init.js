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
// pkg打包时，数据库放在exe同级目录的data文件夹下，保证可写
let DB_PATH;
if (typeof process.pkg !== 'undefined') {
  // pkg打包环境，数据库放到exe所在目录
  const exeDir = path.dirname(process.execPath);
  const dataDir = path.join(exeDir, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  DB_PATH = path.join(dataDir, 'icp.db');
} else {
  // 普通Node环境，用原路径
  DB_PATH = path.join(__dirname, '..', 'data', 'icp.db');
}

let dbInstance = null;           // sql.js Database 实例
let wrapperInstance = null;     // 包装后的数据库实例
let dbReadyPromise = null;       // 初始化 Promise
let saveTimer = null;             // 延迟保存定时器
const SAVE_DELAY = 500;           // 延迟保存时间（毫秒）
let pendingSave = false;           // 是否有待保存的更改

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
   * 保存数据库到文件（立即保存）
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
      pendingSave = false;
    } catch (err) {
      console.error('保存数据库文件失败:', err);
    }
  }

  /**
   * 延迟保存（防抖），避免频繁写盘
   */
  scheduleSave() {
    pendingSave = true;
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      this.saveToFile();
      saveTimer = null;
    }, SAVE_DELAY);
  }

  /**
   * 强制立即保存（用于程序退出等关键场景）
   */
  forceSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (pendingSave) {
      this.saveToFile();
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

          // 自动保存到文件（延迟防抖）
          self.scheduleSave();

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
      this.scheduleSave();
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
      this.scheduleSave();
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
    // pkg打包时wasm在虚拟文件系统中，需要指定路径
    let sqlJsConfig = {};
    if (typeof process.pkg !== 'undefined') {
      // pkg环境：wasm打包在node_modules/sql.js/dist/下
      const wasmPath = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
      sqlJsConfig.locateFile = () => wasmPath;
    }
    const SQL = await initSqlJs(sqlJsConfig);

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

    // 创建计划表
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

    // 创建经营计划表
    database.run(`
      CREATE TABLE IF NOT EXISTS business_plan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_name VARCHAR(200) NOT NULL,
        plan_type VARCHAR(100),
        department VARCHAR(100),
        issue_date DATE,
        expected_finish_date DATE,
        completion_status VARCHAR(20) DEFAULT '未完成',
        is_new_period INTEGER DEFAULT 0,
        creator_id INTEGER,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME
      )
    `);
    console.log('✓ business_plan 表创建完成');

    // 创建交付计划表
    database.run(`
      CREATE TABLE IF NOT EXISTS delivery_plan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_no VARCHAR(100),
        product_name VARCHAR(200),
        user_name VARCHAR(100),
        batch_no VARCHAR(100),
        sortie_no VARCHAR(100),
        assign_command TEXT,
        outline_plan TEXT,
        research_transfer_plan TEXT,
        lead_seal TEXT,
        enter_acceptance TEXT,
        test_flight TEXT,
        transfer_test TEXT,
        transfer_field TEXT,
        yh_plane_no VARCHAR(100),
        current_progress TEXT,
        transfer_cycle VARCHAR(100),
        acceptance_issue_count INTEGER DEFAULT 0,
        memo_count INTEGER DEFAULT 0,
        remark TEXT,
        creator_id INTEGER,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME
      )
    `);
    console.log('✓ delivery_plan 表创建完成');

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
  db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('000000', adminPassword, '系统管理员', 'admin@example.com', 'ADMIN', 1);
  console.log('✓ 创建管理员: 工号000000, 密码admin123');

  // 2. 创建综合计划组
  const group1 = db.prepare(`
    INSERT INTO sys_group (group_name, department, status)
    VALUES (?, ?, ?)
  `).run('综合计划组', '综合管理部', 1);
  console.log('✓ 创建小组: 综合计划组');

  // 3. 创建综合计划组组长 MY
  const leaderPassword = bcrypt.hashSync('leader123', 10);
  const leader1 = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('MY', leaderPassword, 'MY', 'my@example.com', 'LEADER', group1.lastInsertRowid, 1);
  db.prepare('UPDATE sys_group SET leader_id = ? WHERE id = ?').run(leader1.lastInsertRowid, group1.lastInsertRowid);
  console.log('✓ 创建综合计划组组长: 工号MY, 密码leader123');

  // 3.5 创建主任（跨组）
  const directorPassword = bcrypt.hashSync('director123', 10);
  const director = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('ZR', directorPassword, '主任', 'zr@example.com', 'DIRECTOR', group1.lastInsertRowid, 1);
  console.log('✓ 创建主任: 工号ZR, 密码director123');

  // 4. 创建综合计划组组员 ZZY、WMY
  const memberPassword = bcrypt.hashSync('member123', 10);
  const member1a = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('ZZY', memberPassword, 'ZZY', 'zzy@example.com', 'MEMBER', group1.lastInsertRowid, 1);
  const member1b = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('WMY', memberPassword, 'WMY', 'wmy@example.com', 'MEMBER', group1.lastInsertRowid, 1);
  console.log('✓ 创建综合计划组组员: 工号ZZY/WMY, 密码member123');

  // 5. 创建客户管理组
  const group2 = db.prepare(`
    INSERT INTO sys_group (group_name, department, status)
    VALUES (?, ?, ?)
  `).run('客户管理组', '客户服务部', 1);
  console.log('✓ 创建小组: 客户管理组');

  // 6. 创建客户管理组组长 DH
  const leader2 = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('DH', leaderPassword, 'DH', 'dh@example.com', 'LEADER', group2.lastInsertRowid, 1);
  db.prepare('UPDATE sys_group SET leader_id = ? WHERE id = ?').run(leader2.lastInsertRowid, group2.lastInsertRowid);
  console.log('✓ 创建客户管理组组长: 工号DH, 密码leader123');

  // 7. 创建客户管理组组员 A1、A2、A3
  const member2a = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('A1', memberPassword, 'A1', 'a1@example.com', 'MEMBER', group2.lastInsertRowid, 1);
  const member2b = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('A2', memberPassword, 'A2', 'a2@example.com', 'MEMBER', group2.lastInsertRowid, 1);
  const member2c = db.prepare(`
    INSERT INTO sys_user (username, password, real_name, email, role, group_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('A3', memberPassword, 'A3', 'a3@example.com', 'MEMBER', group2.lastInsertRowid, 1);
  console.log('✓ 创建客户管理组组员: 工号A1/A2/A3, 密码member123');

  // ===== 插入计划数据 =====
  function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  // 用户分组
  const group1Users = [leader1.lastInsertRowid, member1a.lastInsertRowid, member1b.lastInsertRowid];
  const group2Users = [leader2.lastInsertRowid, member2a.lastInsertRowid, member2b.lastInsertRowid, member2c.lastInsertRowid];
  const allGroupIds = [group1.lastInsertRowid, group2.lastInsertRowid];

  // 类别→小组映射
  const categoryGroupMap = {
    '综合计划': { users: group1Users, groupId: allGroupIds[0] },
    '合规管理': { users: group1Users, groupId: allGroupIds[0] },
    '客户服务': { users: group2Users, groupId: allGroupIds[1] },
    '客户合规': { users: group2Users, groupId: allGroupIds[1] },
    '风险控制': { users: group1Users, groupId: allGroupIds[0] },
    '信息安全': { users: group2Users, groupId: allGroupIds[1] }
  };

  const categories = ['综合计划', '合规管理', '客户服务', '客户合规', '风险控制', '信息安全'];
  const projects = {
    '综合计划': ['年度计划编制', '计划执行跟踪', '考核评估项目', '制度建设完善'],
    '合规管理': ['合规检查项目', '制度合规审查', '监管报送整改', '合规文化建设'],
    '客户服务': ['客户满意度提升', '服务流程优化', '投诉处理机制', '客户关系维护'],
    '客户合规': ['客户尽职调查', '反洗钱合规', '客户信息保护', '合规培训项目'],
    '风险控制': ['风险评估体系', '操作风险管控', '内部控制优化', '应急响应机制'],
    '信息安全': ['信息安全体系', '数据安全治理', '网络安全加固', '等保合规项目']
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

  // 计划数据模板（30条）
  const planTemplates = [
    // 综合计划（5条）
    { cat: 0, proj: 0, action: '编制年度综合计划', src: 0, del: 0, days: 15, status: 1, overdue: 0 },
    { cat: 0, proj: 1, action: '季度计划执行分析', src: 1, del: 6, days: -3, status: 1, overdue: 1 },
    { cat: 0, proj: 2, action: '绩效考核方案制定', src: 5, del: 5, days: 20, status: 0, overdue: 0 },
    { cat: 0, proj: 3, action: '制度修订完善', src: 3, del: 0, days: 7, status: 1, overdue: 0 },
    { cat: 0, proj: 0, action: '计划执行情况通报', src: 0, del: 6, days: -8, status: 2, overdue: 0 },

    // 合规管理（5条）
    { cat: 1, proj: 0, action: '合规检查方案制定', src: 2, del: 2, days: 10, status: 1, overdue: 0 },
    { cat: 1, proj: 1, action: '制度合规审查', src: 0, del: 7, days: -5, status: 1, overdue: 1 },
    { cat: 1, proj: 2, action: '监管报送整改落实', src: 2, del: 4, days: 3, status: 1, overdue: 0 },
    { cat: 1, proj: 3, action: '合规文化建设', src: 5, del: 3, days: 45, status: 3, overdue: 0 },
    { cat: 1, proj: 0, action: '合规培训方案制定', src: 0, del: 3, days: 5, status: 1, overdue: 0 },

    // 客户服务（5条）
    { cat: 2, proj: 0, action: '客户满意度调查', src: 0, del: 6, days: 12, status: 1, overdue: 0 },
    { cat: 2, proj: 1, action: '服务流程优化', src: 5, del: 5, days: -4, status: 1, overdue: 1 },
    { cat: 2, proj: 2, action: '投诉处理机制完善', src: 3, del: 0, days: 8, status: 0, overdue: 0 },
    { cat: 2, proj: 3, action: '客户关系维护方案', src: 0, del: 0, days: 25, status: 1, overdue: 0 },
    { cat: 2, proj: 0, action: 'VIP客户服务提升', src: 5, del: 5, days: -10, status: 2, overdue: 0 },

    // 客户合规（5条）
    { cat: 3, proj: 0, action: '客户尽职调查', src: 2, del: 1, days: 6, status: 1, overdue: 0 },
    { cat: 3, proj: 1, action: '反洗钱合规检查', src: 2, del: 2, days: -7, status: 1, overdue: 1 },
    { cat: 3, proj: 2, action: '客户信息保护审查', src: 0, del: 7, days: 3, status: 1, overdue: 0 },
    { cat: 3, proj: 3, action: '合规培训组织', src: 5, del: 3, days: 30, status: 3, overdue: 0 },
    { cat: 3, proj: 0, action: '可疑交易监测', src: 1, del: 6, days: 1, status: 1, overdue: 0 },

    // 风险控制（5条）
    { cat: 4, proj: 0, action: '风险评估报告编制', src: 1, del: 1, days: 10, status: 1, overdue: 0 },
    { cat: 4, proj: 1, action: '操作风险识别评估', src: 0, del: 6, days: -2, status: 1, overdue: 1 },
    { cat: 4, proj: 2, action: '内部控制优化', src: 3, del: 5, days: 15, status: 0, overdue: 0 },
    { cat: 4, proj: 3, action: '应急响应机制完善', src: 4, del: 0, days: 5, status: 1, overdue: 0 },
    { cat: 4, proj: 0, action: '风险偏好声明更新', src: 0, del: 1, days: -15, status: 2, overdue: 0 },

    // 信息安全（5条）
    { cat: 5, proj: 0, action: '信息安全制度修订', src: 0, del: 0, days: 12, status: 1, overdue: 0 },
    { cat: 5, proj: 1, action: '数据分类分级', src: 2, del: 6, days: -6, status: 1, overdue: 1 },
    { cat: 5, proj: 2, action: '网络安全加固', src: 4, del: 2, days: 8, status: 0, overdue: 0 },
    { cat: 5, proj: 3, action: '等保三级测评', src: 2, del: 2, days: 3, status: 1, overdue: 0 },
    { cat: 5, proj: 0, action: '安全意识培训', src: 5, del: 3, days: 40, status: 3, overdue: 0 }
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
      idx + 1, cat, proj, t.action, sources[t.src], deliverables[t.del],
      userId, issueDate, deadline, progress,
      statuses[t.status], t.overdue, userId, groupId
    );
  });

  console.log('✓ 插入30条测试计划数据');

  // 引入业务数据生成模块
  var seedData = require('./seed-data');

  // ===== 插入经营计划测试数据
  var bpCount = db.prepare('SELECT COUNT(*) as count FROM business_plan').get();
  if (!bpCount || bpCount.count === 0) {
    seedData.seedBusinessPlans(db);
    console.log('✓ 插入60条经营计划测试数据');
  } else {
    console.log('经营计划数据已存在，跳过插入');
  }

  // ===== 插入交付计划测试数据
  var dpCount = db.prepare('SELECT COUNT(*) as count FROM delivery_plan').get();
  if (!dpCount || dpCount.count === 0) {
    seedData.seedDeliveryPlans(db);
    console.log('✓ 插入60条交付计划测试数据');
  } else {
    console.log('交付计划数据已存在，跳过插入');
  }

  console.log('  合计：2小组/8用户/30条重点计划/60条经营计划/60条交付计划');
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

// 进程退出时强制保存数据，防止丢失
function handleShutdown() {
  if (wrapperInstance && pendingSave) {
    console.log('正在保存数据库...');
    wrapperInstance.forceSave();
    console.log('数据库已保存');
  }
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
process.on('exit', handleShutdown);

// ===== 自动备份功能 =====
const BACKUP_KEEP_COUNT = 7; // 保留最近7份备份
const BACKUP_INTERVAL = 60 * 60 * 1000; // 每小时备份一次（可配置）
let backupTimer = null;

/**
 * 创建数据库备份
 */
function createBackup() {
  if (!wrapperInstance || !fs.existsSync(DB_PATH)) {
    return;
  }

  try {
    const backupDir = path.join(path.dirname(DB_PATH), 'backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // 生成备份文件名（带时间戳）
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .substring(0, 19);
    const backupFile = path.join(backupDir, `icp_backup_${timestamp}.db`);

    // 先强制保存当前数据，再复制
    wrapperInstance.forceSave();
    
    // 复制数据库文件
    fs.copyFileSync(DB_PATH, backupFile);
    console.log(`数据库备份完成: ${backupFile}`);

    // 清理旧备份，只保留最近N份
    cleanupOldBackups(backupDir);
  } catch (err) {
    console.error('数据库备份失败:', err);
  }
}

/**
 * 清理旧备份文件
 */
function cleanupOldBackups(backupDir) {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('icp_backup_') && f.endsWith('.db'))
      .sort()
      .reverse(); // 最新的在前

    if (files.length > BACKUP_KEEP_COUNT) {
      const toDelete = files.slice(BACKUP_KEEP_COUNT);
      toDelete.forEach(f => {
        fs.unlinkSync(path.join(backupDir, f));
        console.log(`清理旧备份: ${f}`);
      });
    }
  } catch (err) {
    console.error('清理旧备份失败:', err);
  }
}

/**
 * 启动自动备份
 */
function startAutoBackup() {
  if (backupTimer) {
    clearInterval(backupTimer);
  }
  backupTimer = setInterval(createBackup, BACKUP_INTERVAL);
  console.log(`自动备份已启动，间隔${BACKUP_INTERVAL / 60000}分钟，保留${BACKUP_KEEP_COUNT}份`);
}

/**
 * 停止自动备份
 */
function stopAutoBackup() {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
    console.log('自动备份已停止');
  }
}

// 导出模块
module.exports = { initDatabase, getDb, getDbReady, createBackup, startAutoBackup, stopAutoBackup };
