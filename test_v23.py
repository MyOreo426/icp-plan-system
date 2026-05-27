#!/usr/bin/env python3
"""全量测试脚本 - 循环测试直到所有PASS"""
import subprocess
import re
import os

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results = []
    
    def add(self, item, passed, note=""):
        status = "✅ PASS" if passed else "❌ FAIL"
        self.results.append((item, passed, note))
        if passed:
            self.passed += 1
        else:
            self.failed += 1
        return passed

def check_file_contains(filepath, pattern, desc=""):
    """检查文件是否包含指定内容"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    return bool(re.search(pattern, content)), content

def test_notification_panel(tr, filepath, filename):
    """测试通知面板"""
    passed, content = check_file_contains(filepath, r'\.notification-panel\s*\{', "通知面板CSS")
    tr.add(f"[{filename}] 通知面板CSS存在", passed)
    
    passed, content = check_file_contains(filepath, r'id="notifPanel"', "通知面板HTML")
    tr.add(f"[{filename}] 通知面板HTML存在", passed)
    
    passed, content = check_file_contains(filepath, r'id="notifList"', "通知列表ID")
    tr.add(f"[{filename}] 通知列表ID存在", passed)

def test_js_functions(tr, filepath, filename, functions):
    """测试JS函数是否存在"""
    for func in functions:
        pattern = rf'function\s+{func}\s*\('
        passed, _ = check_file_contains(filepath, pattern, f"函数{func}")
        tr.add(f"[{filename}] 函数{func}存在", passed)

def test_js_syntax(filepath, filename):
    """用node检查JS语法"""
    # 提取script标签内容
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 匹配script标签内容
    pattern = r'<script[^>]*>(.*?)</script>'
    matches = re.findall(pattern, content, re.DOTALL)
    
    all_ok = True
    for i, js in enumerate(matches):
        if not js.strip():
            continue
        # 写入临时文件
        tmpfile = f'/tmp/test_{filename}_{i}.js'
        with open(tmpfile, 'w') as f:
            f.write(js)
        
        # 用node检查
        result = subprocess.run(['node', '--check', tmpfile], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"  ❌ [{filename}] Script#{i} 语法错误:")
            print(f"     {result.stderr[:200]}")
            all_ok = False
        os.remove(tmpfile)
    
    return all_ok

def run_tests():
    """运行所有测试"""
    tr = TestResult()
    import os
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')
    
    files = {
        'plan-list.html': f'{base}/plan-list.html',
        'import-export.html': f'{base}/import-export.html',
        'operation-log.html': f'{base}/operation-log.html',
        'admin.html': f'{base}/admin.html',
        'plan-edit.html': f'{base}/plan-edit.html',
        'index.html': f'{base}/index.html',
    }
    
    print("=" * 70)
    print("开始全量测试")
    print("=" * 70)
    
    # ========== 1. 各页面通知面板测试 ==========
    print("\n【1. 通知面板测试】")
    for name, path in files.items():
        if 'index' in name:
            continue  # index可能不需要通知
        test_notification_panel(tr, path, name)
    
    # ========== 2. JS语法测试 ==========
    print("\n【2. JS语法测试】")
    for name, path in files.items():
        passed = test_js_syntax(path, name)
        tr.add(f"[{name}] JS语法正确", passed)
    
    # ========== 3. plan-list.html 特定测试 ==========
    print("\n【3. plan-list.html 特定测试】")
    path = files['plan-list.html']
    
    # loadPlans(1)调用
    passed, content = check_file_contains(path, r'loadPlans\s*\(\s*1\s*\)', "loadPlans(1)")
    tr.add("[plan-list.html] loadPlans(1)调用存在", passed)
    
    # init函数包含loadNotificationCount
    passed, content = check_file_contains(path, r'await\s+loadNotificationCount\s*\(\s*\)', "loadNotificationCount调用")
    tr.add("[plan-list.html] loadNotificationCount调用存在", passed)
    
    # 必要的函数
    test_js_functions(tr, path, 'plan-list.html', ['init', 'loadPlans', 'renderPlans', 'toggleNotification', 'loadNotifications', 'renderNotifications'])
    
    # ========== 4. import-export.html 特定测试 ==========
    print("\n【4. import-export.html 特定测试】")
    path = files['import-export.html']
    test_js_functions(tr, path, 'import-export.html', ['toggleNotification', 'logout', 'checkAuth'])
    
    # ========== 5. operation-log.html 特定测试 ==========
    print("\n【5. operation-log.html 特定测试】")
    path = files['operation-log.html']
    test_js_functions(tr, path, 'operation-log.html', ['toggleNotification', 'logout', 'checkAuth', 'loadLogs'])
    
    # ========== 6. admin.html 特定测试 ==========
    print("\n【6. admin.html 特定测试】")
    path = files['admin.html']
    
    # 创建用户按钮id
    passed, _ = check_file_contains(path, r'id="createUserBtn"', "createUserBtn id")
    tr.add("[admin.html] createUserBtn按钮id存在", passed)
    
    # switchTab函数中有关于createUserBtn的显示/隐藏逻辑
    passed, _ = check_file_contains(path, r"createUserBtn.*?style\.display\s*=\s*['\"]none['\"]", "隐藏createUserBtn")
    tr.add("[admin.html] switchTab中有隐藏createUserBtn逻辑", passed)
    
    passed, _ = check_file_contains(path, r"createUserBtn.*?style\.display\s*=\s*['\"]flex['\"]", "显示createUserBtn")
    tr.add("[admin.html] switchTab中有显示createUserBtn逻辑", passed)
    
    # 检查insertAdjacentHTML是否已清理
    passed, _ = check_file_contains(path, r"insertAdjacentHTML\s*\(\s*['\"]afterparent['\"]", "insertAdjacentHTML清理")
    tr.add("[admin.html] insertAdjacentHTML已清理", not passed)
    
    test_js_functions(tr, path, 'admin.html', ['switchTab', 'loadUsers', 'logout', 'checkAuth'])
    
    # ========== 7. plan-edit.html 特定测试 ==========
    print("\n【7. plan-edit.html 特定测试】")
    path = files['plan-edit.html']
    
    # 检查insertAdjacentHTML是否已清理
    passed, _ = check_file_contains(path, r"insertAdjacentHTML\s*\(\s*['\"]afterparent['\"]", "insertAdjacentHTML清理")
    tr.add("[plan-edit.html] insertAdjacentHTML已清理", not passed)
    
    test_js_functions(tr, path, 'plan-edit.html', ['toggleNotification', 'logout', 'savePlan'])
    
    # ========== 8. CSS完整性检查 ==========
    print("\n【8. CSS完整性检查】")
    for name, path in files.items():
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 检查CSS括号配对
        style_match = re.search(r'<style[^>]*>(.*?)</style>', content, re.DOTALL)
        if style_match:
            css = style_match.group(1)
            opens = css.count('{')
            closes = css.count('}')
            passed = opens == closes
            tr.add(f"[{name}] CSS括号配对({opens}/{closes})", passed)
    
    # ========== 9. 导航栏一致性检查 ==========
    print("\n【9. 导航栏一致性检查】")
    for name, path in files.items():
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 系统标题
        passed = '内控计划共享编辑系统' in content
        tr.add(f"[{name}] 系统标题存在", passed)
        
        # 导航栏结构
        passed = 'class="navbar"' in content and 'class="navbar-right"' in content
        tr.add(f"[{name}] 导航栏结构完整", passed)
        
        # 通知按钮
        passed = 'class="notification-btn"' in content
        tr.add(f"[{name}] 通知按钮存在", passed)
        
        # 退出按钮
        passed = 'logout()' in content
        tr.add(f"[{name}] 退出按钮绑定logout()", passed)
    
    # ========== 10. 权限控制一致性 ==========
    print("\n【10. 权限控制一致性】")
    
    # 检查ADMIN的导航按钮
    admin_path = files['admin.html']
    with open(admin_path, 'r', encoding='utf-8') as f:
        admin_content = f.read()
    
    passed = '用户管理' in admin_content and 'navUserBtn' in admin_content
    tr.add("[admin.html] 管理员有用户管理按钮", passed)
    
    passed = '小组管理' in admin_content and 'navGroupBtn' in admin_content
    tr.add("[admin.html] 管理员有小组管理按钮", passed)
    
    # ========== 打印结果 ==========
    print("\n" + "=" * 70)
    print("测试结果汇总")
    print("=" * 70)
    
    for item, passed, note in tr.results:
        status = "✅ PASS" if passed else "❌ FAIL"
        note_str = f" ({note})" if note else ""
        print(f"{status} {item}{note_str}")
    
    print("\n" + "-" * 70)
    print(f"总计: {tr.passed} 通过, {tr.failed} 失败")
    print("=" * 70)
    
    return tr.failed == 0

def main():
    iteration = 0
    while True:
        iteration += 1
        print(f"\n{'='*70}")
        print(f"第 {iteration} 轮测试")
        print(f"{'='*70}")
        
        all_passed = run_tests()
        
        if all_passed:
            print("\n🎉 所有测试通过! 准备打包...")
            break
        else:
            print("\n⚠️  有测试失败，需要修复...")
            # 执行修复脚本
            print("\n执行修复脚本...")
            result = subprocess.run(['python3', './项目代码/fix_v22.py'], capture_output=True, text=True)
            print(result.stdout)
            if result.returncode != 0:
                print(f"修复脚本执行失败: {result.stderr}")
            
            print("\n修复完成，重新测试...")

if __name__ == '__main__':
    main()
