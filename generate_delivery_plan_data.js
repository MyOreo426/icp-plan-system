/**
 * 生成150条交付计划测试数据
 */

const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'icp.db');
const { initDatabase, getDb } = require('./db/init');

async function generateTestData() {
    console.log('开始生成交付计划测试数据...');
    
    await initDatabase();
    const db = getDb();
    
    db.prepare('DELETE FROM delivery_plan').run();
    console.log('已清空原有交付计划数据');
    
    // 产品类型
    const productTypes = [
        { prefix: 'YH', name: 'YH系列战机' },
        { prefix: 'JH', name: 'JH系列战机' },
        { prefix: 'Z', name: 'Z系列直升机' },
        { prefix: 'H', name: 'H系列轰炸机' },
        { prefix: 'KJ', name: 'KJ系列预警机' }
    ];
    
    // 用户/客户
    const users = ['空军某部', '海军航空兵', '陆军航空兵', '试飞院', '训练基地', '某国用户'];
    
    // 批次
    const batches = ['01批', '02批', '03批', '04批', '05批'];
    
    // 当前进度状态
    const progressStatuses = ['大纲阶段', '科研转场', '铅封阶段', '接装阶段', '检飞阶段', '转试阶段', '已转场', '已交付'];
    
    // 转场周期
    const cycles = ['30天', '45天', '60天', '75天', '90天'];
    
    let successCount = 0;
    
    for (let i = 1; i <= 150; i++) {
        const typeIdx = Math.floor(Math.random() * productTypes.length);
        const productType = productTypes[typeIdx];
        
        const productNo = `${productType.prefix}-${String(2024 + Math.floor(Math.random() * 2)).slice(-2)}${String(Math.floor(Math.random() * 100)).padStart(3, '0')}`;
        const productName = productType.name;
        const userName = users[Math.floor(Math.random() * users.length)];
        const batchNo = batches[Math.floor(Math.random() * batches.length)];
        const sortieNo = String(Math.floor(Math.random() * 20) + 1).padStart(2, '0');
        const currentProgress = progressStatuses[Math.floor(Math.random() * progressStatuses.length)];
        const transferCycle = cycles[Math.floor(Math.random() * cycles.length)];
        const acceptanceIssueCount = Math.floor(Math.random() * 15);
        const memoCount = Math.floor(Math.random() * 8);
        const yhPlaneNo = Math.random() > 0.5 ? `${productType.prefix}-${String(Math.floor(Math.random() * 100)).padStart(3, '0')}` : null;
        
        // 大纲计划时间：今年内随机月份
        const outlineDate = new Date();
        outlineDate.setMonth(Math.floor(Math.random() * 12));
        outlineDate.setDate(Math.floor(Math.random() * 28) + 1);
        const outlinePlan = outlineDate.toISOString().split('T')[0];
        
        // 科研转场计划：大纲计划之后1-3个月
        const transferDate = new Date(outlineDate);
        transferDate.setMonth(transferDate.getMonth() + Math.floor(Math.random() * 3) + 1);
        const researchTransferPlan = transferDate.toISOString().split('T')[0];
        
        // 其他日期字段
        const leadSealDate = new Date(transferDate);
        leadSealDate.setDate(leadSealDate.getDate() + Math.floor(Math.random() * 30));
        const leadSeal = Math.random() > 0.3 ? leadSealDate.toISOString().split('T')[0] : null;
        
        const enterAcceptanceDate = new Date(leadSealDate);
        enterAcceptanceDate.setDate(enterAcceptanceDate.getDate() + Math.floor(Math.random() * 20));
        const enterAcceptance = Math.random() > 0.4 ? enterAcceptanceDate.toISOString().split('T')[0] : null;
        
        const testFlightDate = new Date(enterAcceptanceDate);
        testFlightDate.setDate(testFlightDate.getDate() + Math.floor(Math.random() * 25));
        const testFlight = Math.random() > 0.5 ? testFlightDate.toISOString().split('T')[0] : null;
        
        const transferTestDate = new Date(testFlightDate);
        transferTestDate.setDate(transferTestDate.getDate() + Math.floor(Math.random() * 15));
        const transferTest = Math.random() > 0.6 ? transferTestDate.toISOString().split('T')[0] : null;
        
        const transferFieldDate = new Date(transferTestDate);
        transferFieldDate.setDate(transferFieldDate.getDate() + Math.floor(Math.random() * 20));
        const transferField = Math.random() > 0.7 ? transferFieldDate.toISOString().split('T')[0] : null;
        
        const assignCommand = `命令字${Math.floor(Math.random() * 1000)}号`;
        const remark = Math.random() > 0.7 ? `备注信息${i}` : null;
        
        try {
            db.prepare(`
                INSERT INTO delivery_plan (
                    product_no, product_name, user_name, batch_no, sortie_no,
                    assign_command, outline_plan, research_transfer_plan,
                    lead_seal, enter_acceptance, test_flight, transfer_test,
                    transfer_field, yh_plane_no, current_progress, transfer_cycle,
                    acceptance_issue_count, memo_count, remark, creator_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                productNo, productName, userName, batchNo, sortieNo,
                assignCommand, outlinePlan, researchTransferPlan,
                leadSeal, enterAcceptance, testFlight, transferTest,
                transferField, yhPlaneNo, currentProgress, transferCycle,
                acceptanceIssueCount, memoCount, remark, 1
            );
            successCount++;
        } catch (err) {
            console.error(`第${i}条插入失败:`, err.message);
        }
    }
    
    // 保存数据库
    const data = db.db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    
    console.log(`✓ 成功生成 ${successCount} 条交付计划测试数据`);
    
    // 统计各月大纲计划数量
    const stats = db.prepare(`
        SELECT 
            SUBSTR(outline_plan, 6, 2) as month,
            COUNT(*) as count
        FROM delivery_plan
        WHERE outline_plan IS NOT NULL
        GROUP BY SUBSTR(outline_plan, 6, 2)
        ORDER BY month
    `).all();
    
    console.log('\n各月大纲计划分布:');
    stats.forEach(s => console.log(`  ${s.month}月: ${s.count}条`));
}

generateTestData().catch(console.error);
