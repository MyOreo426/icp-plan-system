/**
 * 生成200条经营计划测试数据
 */

const path = require('path');
const fs = require('fs');

// 数据库文件路径
const dbPath = path.join(__dirname, 'data', 'icp.db');

// 先确保数据库初始化了
const { initDatabase, getDb } = require('./db/init');

async function generateTestData() {
    console.log('开始生成经营计划测试数据...');
    
    await initDatabase();
    const db = getDb();
    
    // 先清空现有数据
    db.prepare('DELETE FROM business_plan').run();
    console.log('已清空原有经营计划数据');
    
    // 数据维度
    const planTypes = ['年度计划', '季度计划', '月度计划', '专项计划', '整改计划', '培训计划'];
    const departments = ['综合管理部', '财务部', '人力资源部', '客户服务部', '风险管理部', '信息科技部', '合规部', '审计部'];
    const statuses = ['已完成', '进行中', '未完成'];
    const isNewOptions = [0, 1];
    
    const planNames = [
        '年度经营目标制定', '客户满意度提升计划', '风险管控体系建设', '信息安全专项整治',
        '员工培训计划', '流程优化项目', '系统升级改造', '数据治理专项',
        '合规检查计划', '内部审计项目', '绩效考核方案制定', '人才培养计划',
        '业务拓展计划', '产品研发项目', '质量提升工程', '效率提升专项',
        '成本控制计划', '预算编制项目', '制度修订完善', '应急演练计划',
        '数字化转型项目', '客户服务升级', '风险管理系统建设', '信息系统安全加固',
        '企业文化建设', '品牌推广计划', '市场调研项目', '战略合作推进',
        '供应链优化', '库存管理提升', '安全生产专项', '环境保护计划',
        '知识管理系统', '办公自动化升级', '移动应用开发', '数据中台建设',
        'AI应用探索', '区块链研究', '云计算平台搭建', '大数据分析项目'
    ];
    
    let successCount = 0;
    
    for (let i = 1; i <= 200; i++) {
        const planName = planNames[Math.floor(Math.random() * planNames.length)] + ` (${i})`;
        const planType = planTypes[Math.floor(Math.random() * planTypes.length)];
        const department = departments[Math.floor(Math.random() * departments.length)];
        const completionStatus = statuses[Math.floor(Math.random() * statuses.length)];
        const isNewPeriod = isNewOptions[Math.floor(Math.random() * isNewOptions.length)];
        
        // 随机日期：过去6个月到未来6个月
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6 + Math.floor(Math.random() * 6));
        const issueDate = startDate.toISOString().split('T')[0];
        
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 180) + 30);
        const expectedFinishDate = endDate.toISOString().split('T')[0];
        
        try {
            db.prepare(`
                INSERT INTO business_plan (
                    plan_name, plan_type, department, issue_date,
                    expected_finish_date, completion_status, is_new_period, creator_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                planName,
                planType,
                department,
                issueDate,
                expectedFinishDate,
                completionStatus,
                isNewPeriod,
                1 // 管理员创建
            );
            successCount++;
        } catch (err) {
            console.error(`第${i}条插入失败:`, err.message);
        }
    }
    
    console.log(`✓ 成功插入 ${successCount} 条经营计划测试数据`);
    
    // 统计一下
    const stats = db.prepare(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN completion_status = '已完成' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN completion_status = '进行中' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN completion_status = '未完成' THEN 1 ELSE 0 END) as incomplete,
            SUM(CASE WHEN is_new_period = 1 THEN 1 ELSE 0 END) as new_period
        FROM business_plan
    `).get();
    
    console.log('数据统计:');
    console.log('  总数:', stats.total);
    console.log('  已完成:', stats.completed);
    console.log('  进行中:', stats.in_progress);
    console.log('  未完成:', stats.incomplete);
    console.log('  本期新增:', stats.new_period);
    
    // 按类型统计
    const typeStats = db.prepare(`
        SELECT plan_type, COUNT(*) as count
        FROM business_plan
        GROUP BY plan_type
        ORDER BY count DESC
    `).all();
    
    console.log('\n按计划类型分布:');
    typeStats.forEach(t => {
        console.log(`  ${t.plan_type}: ${t.count}条`);
    });
    
    // 按科室统计
    const deptStats = db.prepare(`
        SELECT department, COUNT(*) as count
        FROM business_plan
        GROUP BY department
        ORDER BY count DESC
    `).all();
    
    console.log('\n按责任科室分布:');
    deptStats.forEach(d => {
        console.log(`  ${d.department}: ${d.count}条`);
    });
    
    // 强制保存
    if (db.saveToFile) {
        db.saveToFile();
    }
    
    console.log('\n✓ 数据已保存到数据库');
}

generateTestData().catch(err => {
    console.error('生成失败:', err);
    process.exit(1);
});
