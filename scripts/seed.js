/**
 * 经营计划 & 交付计划 测试数据初始化脚本
 * 执行方式：node scripts/seed.js
 * 注意：执行前请先 npm install 安装依赖
 */

const { initDatabase, getDb } = require('../db/init');

// 经营计划配置
const planTypes = ['任务类', '指标类', '科研生产任务类'];
const departments = ['一室', '二室', '质量室', '计划室'];
const statuses = ['未完成', '执行中', '已完成'];

// 交付计划配置
const productNames = ['XX装备', 'YY系统', 'ZZ平台', 'HH导弹', 'JJ雷达'];
const users = ['1A部队', '2B基地', '3C所', '4D院', '5E厂'];
const progressList = ['待接装', '接装中', '大纲评审', '科研转场', '铅封中', '检飞中', '转试中', '转场完成'];

// 生成随机日期
function randomDate(startYear, startMonth, startDay, endYear, endMonth, endDay) {
  const start = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString().split('T')[0];
}

// 生成经营计划数据
function seedBusinessPlans(db) {
  const plans = [];
  let id = 1;

  // 每种类型 × 每个科室 各生成5条，共3×4×5=60条
  for (const type of planTypes) {
    for (const dept of departments) {
      for (let i = 1; i <= 5; i++) {
        const issueDate = randomDate(2025, 1, 1, 2026, 6, 30);
        const duration = 30 + Math.floor(Math.random() * 120); // 30-150天
        const finishDate = new Date(issueDate);
        finishDate.setDate(finishDate.getDate() + duration);
        const finishDateStr = finishDate.toISOString().split('T')[0];

        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const isNew = Math.random() > 0.6 ? 1 : 0;

        plans.push({
          id: id++,
          plan_name: `${type}项目-${dept}-${String(i).padStart(2, '0')}`,
          plan_type: type,
          department: dept,
          issue_date: issueDate,
          expected_finish_date: finishDateStr,
          completion_status: status,
          is_new_period: isNew,
          creator_id: 1
        });
      }
    }
  }

  // 清空并插入
  db.prepare('DELETE FROM business_plan').run();
  const stmt = db.prepare(`
    INSERT INTO business_plan (id, plan_name, plan_type, department, issue_date, expected_finish_date, completion_status, is_new_period, creator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  plans.forEach(p => stmt.run(p.id, p.plan_name, p.plan_type, p.department, p.issue_date, p.expected_finish_date, p.completion_status, p.is_new_period, p.creator_id));
  console.log(`✅ 经营计划数据已生成：${plans.length} 条`);
}

// 生成交付计划数据
function seedDeliveryPlans(db) {
  const plans = [];
  let id = 1;

  // 共60条
  for (let i = 0; i < 60; i++) {
    const productName = productNames[Math.floor(Math.random() * productNames.length)];
    const user = users[Math.floor(Math.random() * users.length)];
    const batch = Math.floor(Math.random() * 5) + 1;
    const sortie = Math.floor(Math.random() * 12) + 1;
    const assignCmd = `命字${String(2024000 + i).padStart(6, '0')}号`;

    const baseYear = 2024 + Math.floor(Math.random() * 2);
    const baseMonth = Math.floor(Math.random() * 12) + 1;
    const baseDay = Math.floor(Math.random() * 28) + 1;
    const baseDate = new Date(baseYear, baseMonth - 1, baseDay);

    const outlineDate = new Date(baseDate);
    const researchDate = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const leadSealDate = new Date(baseDate.getTime() + 60 * 24 * 60 * 60 * 1000);
    const acceptanceDate = new Date(baseDate.getTime() + 75 * 24 * 60 * 60 * 1000);
    const testFlightDate = new Date(baseDate.getTime() + 100 * 24 * 60 * 60 * 1000);
    const transferTestDate = new Date(baseDate.getTime() + 130 * 24 * 60 * 60 * 1000);
    const transferFieldDate = new Date(baseDate.getTime() + 160 * 24 * 60 * 60 * 1000);

    const yhNo = `YH-${String(200 + i).padStart(3, '0')}`;
    const progress = progressList[Math.floor(Math.random() * progressList.length)];
    const cycle = 90 + Math.floor(Math.random() * 90); // 90-180天
    const issues = Math.floor(Math.random() * 30);
    const memos = Math.floor(Math.random() * 15);

    plans.push({
      id: id++,
      product_no: `CP-${String(1000 + i).padStart(4, '0')}`,
      product_name: productName,
      user_name: user,
      batch_no: `${batch}批`,
      sortie_no: `${sortie}架`,
      assign_command: assignCmd,
      outline_plan: outlineDate.toISOString().split('T')[0],
      research_transfer_plan: researchDate.toISOString().split('T')[0],
      lead_seal: leadSealDate.toISOString().split('T')[0],
      enter_acceptance: acceptanceDate.toISOString().split('T')[0],
      test_flight: testFlightDate.toISOString().split('T')[0],
      transfer_test: transferTestDate.toISOString().split('T')[0],
      transfer_field: transferFieldDate.toISOString().split('T')[0],
      yh_plane_no: yhNo,
      current_progress: progress,
      transfer_cycle: `${cycle}天`,
      acceptance_issue_count: issues,
      memo_count: memos,
      remark: Math.random() > 0.7 ? '备注信息' + i : '',
      creator_id: 1
    });
  }

  // 清空并插入
  db.prepare('DELETE FROM delivery_plan').run();
  const stmt = db.prepare(`
    INSERT INTO delivery_plan (
      id, product_no, product_name, user_name, batch_no, sortie_no,
      assign_command, outline_plan, research_transfer_plan, lead_seal,
      enter_acceptance, test_flight, transfer_test, transfer_field,
      yh_plane_no, current_progress, transfer_cycle, acceptance_issue_count,
      memo_count, remark, creator_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  plans.forEach(p => stmt.run(
    p.id, p.product_no, p.product_name, p.user_name, p.batch_no, p.sortie_no,
    p.assign_command, p.outline_plan, p.research_transfer_plan, p.lead_seal,
    p.enter_acceptance, p.test_flight, p.transfer_test, p.transfer_field,
    p.yh_plane_no, p.current_progress, p.transfer_cycle, p.acceptance_issue_count,
    p.memo_count, p.remark, p.creator_id
  ));
  console.log(`✅ 交付计划数据已生成：${plans.length} 条`);
}

// 主函数
async function main() {
  console.log('🚀 开始初始化测试数据...\n');

  try {
    // 初始化数据库（会自动创建表结构 + 用户种子数据）
    await initDatabase();
    const db = getDb();

    // 生成业务数据
    seedBusinessPlans(db);
    seedDeliveryPlans(db);

    // 强制保存到文件
    db.forceSave();

    console.log('\n🎉 所有数据初始化完成！');
    console.log('   经营计划：60条（3种类型 × 4个科室 × 5条）');
    console.log('   交付计划：60条');
    console.log('\n📝 登录账号：');
    console.log('   主任：ZR / director123');
    console.log('   组长：MY / leader123');
    console.log('   管理员：000000 / admin123');
  } catch (err) {
    console.error('❌ 初始化失败：', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
