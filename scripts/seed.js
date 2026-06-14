/**
 * 经营计划 & 交付计划 测试数据初始化脚本
 * 执行方式：node scripts/seed.js
 * 注意：执行前请先 npm install 安装依赖
 */

var initDb = require('../db/init');
var seedData = require('../db/seed-data');

async function main() {
  console.log('正在初始化数据库...');

  try {
    // 初始化数据库
    await initDb.initDatabase();
    var db = initDb.getDb();

    // 清空现有数据
    db.prepare('DELETE FROM business_plan').run();
    db.prepare('DELETE FROM delivery_plan').run();
    console.log('已清空原有业务数据');

    // 生成新数据
    seedData.seedBusinessPlans(db);
    seedData.seedDeliveryPlans(db);

    // 强制保存
    db.forceSave();

    console.log('');
    console.log('所有数据初始化完成！');
    console.log('  经营计划：60条（3种类型 × 4个科室 × 5条）');
    console.log('  交付计划：60条');
    console.log('');
    console.log('登录账号：');
    console.log('  主任：ZR / director123');
    console.log('  组长：MY / leader123');
    console.log('  管理员：000000 / admin123');
  } catch (err) {
    console.error('初始化失败：', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
