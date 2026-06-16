/**
 * 业务数据生成模块
 * 提供经营计划和交付计划的测试数据生成函数
 * 兼容 Node 12+ 环境
 */

// 经营计划测试数据生成
function seedBusinessPlans(db) {
  var planTypes = ['任务类', '指标类', '科研生产任务类'];
  var departments = ['一室', '二室', '质量室', '计划室'];
  var statuses = ['未完成', '执行中', '已完成'];

  var plans = [];
  var id = 1;

  for (var t = 0; t < planTypes.length; t++) {
    var type = planTypes[t];
    for (var d = 0; d < departments.length; d++) {
      var dept = departments[d];
      for (var i = 1; i <= 5; i++) {
        var issueDate = randomDate(2025, 1, 1, 2026, 6, 30);
        var duration = 30 + Math.floor(Math.random() * 120);
        var finishDate = new Date(issueDate);
        finishDate.setDate(finishDate.getDate() + duration);
        var finishDateStr = formatDate(finishDate);

        // 计划完成日期：在预计完成日期基础上有±15天波动
        var planFinishDate = new Date(finishDate);
        var dayOffset = Math.floor(Math.random() * 31) - 15; // -15 到 +15 天
        planFinishDate.setDate(planFinishDate.getDate() + dayOffset);
        var planFinishDateStr = formatDate(planFinishDate);

        var status = statuses[Math.floor(Math.random() * statuses.length)];
        var isNew = Math.random() > 0.6 ? 1 : 0;

        plans.push({
          id: id++,
          plan_name: type + '项目-' + dept + '-' + padZero(i, 2),
          plan_type: type,
          department: dept,
          issue_date: issueDate,
          expected_finish_date: finishDateStr,
          plan_finish_date: planFinishDateStr,
          completion_status: status,
          is_new_period: isNew,
          creator_id: 1
        });
      }
    }
  }

  var stmt = db.prepare(
    'INSERT INTO business_plan (id, plan_name, plan_type, department, issue_date, expected_finish_date, plan_finish_date, completion_status, is_new_period, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  for (var p = 0; p < plans.length; p++) {
    var plan = plans[p];
    stmt.run(plan.id, plan.plan_name, plan.plan_type, plan.department, plan.issue_date, plan.expected_finish_date, plan.plan_finish_date, plan.completion_status, plan.is_new_period, plan.creator_id);
  }
}

// 交付计划测试数据生成
function seedDeliveryPlans(db) {
  var productNames = ['XX装备', 'YY系统', 'ZZ平台', 'HH导弹', 'JJ雷达'];
  var users = ['1A部队', '2B基地', '3C所', '4D院', '5E厂'];
  var progressList = ['待接装', '接装中', '大纲评审', '科研转场', '铅封中', '检飞中', '转试中', '转场完成'];

  var plans = [];
  var id = 1;

  for (var i = 0; i < 60; i++) {
    var productName = productNames[Math.floor(Math.random() * productNames.length)];
    var user = users[Math.floor(Math.random() * users.length)];
    var batch = Math.floor(Math.random() * 5) + 1;
    var sortie = Math.floor(Math.random() * 12) + 1;
    var assignCmd = '命字' + padZero(2025000 + i, 6) + '号';

    var baseDate = randomDateObj(2025, 2026);
    var outlineDate = new Date(baseDate.getTime());
    var researchDate = new Date(baseDate.getTime() + 30 * 86400000);
    var leadSealDate = new Date(baseDate.getTime() + 60 * 86400000);
    var acceptanceDate = new Date(baseDate.getTime() + 75 * 86400000);
    var testFlightDate = new Date(baseDate.getTime() + 100 * 86400000);
    var transferTestDate = new Date(baseDate.getTime() + 130 * 86400000);
    var transferFieldDate = new Date(baseDate.getTime() + 160 * 86400000);

    var yhNo = 'YH-' + padZero(200 + i, 3);
    var progress = progressList[Math.floor(Math.random() * progressList.length)];
    var cycle = 90 + Math.floor(Math.random() * 90);
    var issues = Math.floor(Math.random() * 30);
    var memos = Math.floor(Math.random() * 15);

    plans.push({
      id: id++,
      product_no: 'CP-' + padZero(1000 + i, 4),
      product_name: productName,
      user_name: user,
      batch_no: batch + '批',
      sortie_no: sortie + '架',
      assign_command: assignCmd,
      outline_plan: formatDate(outlineDate),
      research_transfer_plan: formatDate(researchDate),
      lead_seal: formatDate(leadSealDate),
      enter_acceptance: formatDate(acceptanceDate),
      test_flight: formatDate(testFlightDate),
      transfer_test: formatDate(transferTestDate),
      transfer_field: formatDate(transferFieldDate),
      yh_plane_no: yhNo,
      current_progress: progress,
      transfer_cycle: cycle + '天',
      acceptance_issue_count: issues,
      memo_count: memos,
      remark: Math.random() > 0.7 ? '备注信息' + i : '',
      creator_id: 1
    });
  }

  var stmt = db.prepare(
    'INSERT INTO delivery_plan (id, product_no, product_name, user_name, batch_no, sortie_no, assign_command, outline_plan, research_transfer_plan, lead_seal, enter_acceptance, test_flight, transfer_test, transfer_field, yh_plane_no, current_progress, transfer_cycle, acceptance_issue_count, memo_count, remark, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  for (var p = 0; p < plans.length; p++) {
    var plan = plans[p];
    stmt.run(
      plan.id, plan.product_no, plan.product_name, plan.user_name, plan.batch_no, plan.sortie_no,
      plan.assign_command, plan.outline_plan, plan.research_transfer_plan, plan.lead_seal,
      plan.enter_acceptance, plan.test_flight, plan.transfer_test, plan.transfer_field,
      plan.yh_plane_no, plan.current_progress, plan.transfer_cycle, plan.acceptance_issue_count,
      plan.memo_count, plan.remark, plan.creator_id
    );
  }
}

// 工具函数：生成随机日期字符串
function randomDate(startYear, startMonth, startDay, endYear, endMonth, endDay) {
  var start = new Date(startYear, startMonth - 1, startDay);
  var end = new Date(endYear, endMonth - 1, endDay);
  var date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return formatDate(date);
}

// 工具函数：生成指定年份范围内的随机日期对象
function randomDateObj(startYear, endYear) {
  var start = new Date(startYear, 0, 1);
  var end = new Date(endYear, 11, 31);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// 工具函数：格式化日期为 YYYY-MM-DD
function formatDate(date) {
  var y = date.getFullYear();
  var m = date.getMonth() + 1;
  var d = date.getDate();
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
}

// 工具函数：数字补零
function padZero(num, len) {
  var str = String(num);
  while (str.length < len) {
    str = '0' + str;
  }
  return str;
}

module.exports = {
  seedBusinessPlans: seedBusinessPlans,
  seedDeliveryPlans: seedDeliveryPlans
};
