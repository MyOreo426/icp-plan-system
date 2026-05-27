#!/usr/bin/env python3
"""测试脚本 - 验证所有修复"""
import subprocess
import re
import os

def test_file(filepath, name):
    """测试单个文件"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    results = []
    
    # 1. 通知面板CSS
    has_css = bool(re.search(r'\.notification-panel\s*\{', content))
    results.append(("通知面板CSS", has_css))
    
    # 2. 通知面板HTML
    has_html = 'id="notifPanel"' in content
    results.append(("通知面板HTML", has_html))
    
    # 3. 通知列表ID
    has_list = 'id="notifList"' in content
    results.append(("通知列表ID", has_list))
    
    # 4. JS语法检查
    pattern = r'<script[^>]*>(.*?)</script>'
    matches = re.findall(pattern, content, re.DOTALL)
    js_ok = True
    for i, js in enumerate(matches):
        if not js.strip():
            continue
        tmpfile = f'/tmp/test_{i}.js'
        with open(tmpfile, 'w') as f:
            f.write(js)
        result = subprocess.run(['node', '--check', tmpfile], capture_output=True)
        if result.returncode != 0:
            js_ok = False
            print(f"  JS语法错误: {result.stderr[:100]}")
        os.remove(tmpfile)
    results.append(("JS语法", js_ok))
    
    # 5. 退出按钮
    has_logout = 'logout()' in content
    results.append(("退出按钮", has_logout))
    
    # 6. 导航栏完整性
    has_nav = 'class="navbar"' in content and 'class="notification-btn"' in content
    results.append(("导航栏", has_nav))
    
    return results

def test_admin():
    """admin.html特定测试"""
    filepath = 'public/admin.html'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    results = []
    
    # 创建用户按钮id
    has_id = 'id="createUserBtn"' in content
    results.append(("创建用户按钮id", has_id))
    
    # switchTab中有createBtn逻辑
    has_show = "createBtn" in content and "style.display = 'flex'" in content
    results.append(("switchTab显示按钮", has_show))
    
    has_hide = "createBtn" in content and "style.display = 'none'" in content
    results.append(("switchTab隐藏按钮", has_hide))
    
    # insertAdjacentHTML已清理
    cleaned = 'insertAdjacentHTML' not in content
    results.append(("insertAdjacentHTML清理", cleaned))
    
    return results

def test_plan_list():
    """plan-list.html特定测试"""
    filepath = 'public/plan-list.html'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    results = []
    
    # loadPlans(1)调用
    has_load = 'loadPlans(1)' in content
    results.append(("loadPlans(1)调用", has_load))
    
    # init中有loadNotificationCount
    has_notif = 'await loadNotificationCount()' in content
    results.append(("loadNotificationCount", has_notif))
    
    return results

def run_tests():
    """运行测试"""
    print("=" * 70)
    print("开始测试")
    print("=" * 70)
    
    all_results = []
    passed = 0
    failed = 0
    
    # 测试各页面
    files = {
        'plan-list.html': 'public/plan-list.html',
        'import-export.html': 'public/import-export.html',
        'operation-log.html': 'public/operation-log.html',
        'admin.html': 'public/admin.html',
        'plan-edit.html': 'public/plan-edit.html',
        'index.html': 'public/index.html',
    }
    
    for name, path in files.items():
        print(f"\n【{name}】")
        results = test_file(path, name)
        for item, ok in results:
            status = "✅" if ok else "❌"
            print(f"  {status} {item}")
            all_results.append((f"[{name}] {item}", ok))
            if ok:
                passed += 1
            else:
                failed += 1
    
    # admin.html特定测试
    print("\n【admin.html 特定】")
    results = test_admin()
    for item, ok in results:
        status = "✅" if ok else "❌"
        print(f"  {status} {item}")
        all_results.append((f"[admin.html] {item}", ok))
        if ok:
            passed += 1
        else:
            failed += 1
    
    # plan-list.html特定测试
    print("\n【plan-list.html 特定】")
    results = test_plan_list()
    for item, ok in results:
        status = "✅" if ok else "❌"
        print(f"  {status} {item}")
        all_results.append((f"[plan-list.html] {item}", ok))
        if ok:
            passed += 1
        else:
            failed += 1
    
    print("\n" + "=" * 70)
    print(f"总计: {passed} 通过, {failed} 失败")
    print("=" * 70)
    
    return failed == 0, all_results

def main():
    iteration = 0
    while True:
        iteration += 1
        print(f"\n{'='*70}")
        print(f"第 {iteration} 轮测试")
        print(f"{'='*70}")
        
        all_passed, results = run_tests()
        
        if all_passed:
            print("\n🎉 所有测试通过!")
            return True, results
        else:
            print("\n⚠️  有测试失败，需要修复...")
            # 执行修复
            print("\n执行修复...")
            result = subprocess.run(['python3', 'fix_all.py'], capture_output=True, text=True)
            print(result.stdout)
            if result.returncode != 0:
                print(f"修复失败: {result.stderr}")
                return False, results
            
            # 如果多轮测试后还是失败，直接退出
            if iteration >= 5:
                print("\n达到最大测试轮数，退出")
                return False, results

if __name__ == '__main__':
    success, results = main()
    
    # 保存测试报告
    report = ["# 测试报告 v23\n\n"]
    report.append("## 测试结果\n\n")
    report.append("| 测试项 | 结果 |\n")
    report.append("|--------|------|\n")
    for item, ok in results:
        status = "✅ PASS" if ok else "❌ FAIL"
        report.append(f"| {item} | {status} |\n")
    
    with open('./项目代码/测试报告_v23.md', 'w', encoding='utf-8') as f:
        f.write(''.join(report))
    
    print(f"\n测试报告已保存到 ./项目代码/测试报告_v23.md")
