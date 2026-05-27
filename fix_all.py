#!/usr/bin/env python3
"""修复脚本 - 确保所有问题都修复"""

NOTIFICATION_HTML = """
    <div class="notification-panel" id="notifPanel">
        <div class="notification-header">
            <span class="notification-title">通知消息</span>
            <span class="notification-mark-read" onclick="markAllRead()">全部已读</span>
        </div>
        <div class="notification-list" id="notifList">
            <div class="notification-empty">暂无通知</div>
        </div>
    </div>
"""

NOTIFICATION_CSS = """        /* 通知面板 */
        .notification-panel {
            position: absolute;
            top: 70px;
            right: 30px;
            width: 380px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
            display: none;
            z-index: 200;
            overflow: hidden;
        }
        .notification-panel.show { display: block; }
        .notification-header {
            padding: 16px 20px;
            border-bottom: 1px solid #e0e6ed;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .notification-title { font-size: 15px; font-weight: 600; color: #2c3e50; }
        .notification-mark-read { font-size: 12px; color: #667eea; cursor: pointer; }
        .notification-mark-read:hover { text-decoration: underline; }
        .notification-list { max-height: 400px; overflow-y: auto; }
        .notification-item {
            padding: 14px 20px;
            border-bottom: 1px solid #f0f3ff;
            display: flex;
            gap: 12px;
            transition: background 0.2s;
        }
        .notification-item:hover { background: #fafbff; }
        .notification-item:last-child { border-bottom: none; }
        .notification-icon {
            width: 36px;
            height: 36px;
            background: #f0f3ff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .notification-icon svg { width: 18px; height: 18px; fill: #667eea; }
        .notification-content { flex: 1; min-width: 0; }
        .notification-text { font-size: 13px; color: #34495e; line-height: 1.5; }
        .notification-time { font-size: 11px; color: #95a5a6; margin-top: 4px; }
        .notification-empty { padding: 40px 20px; text-align: center; color: #95a5a6; font-size: 13px; }
"""

def fix_file(filepath):
    """修复单个文件"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    changes = []
    
    # 1. 添加通知面板CSS（如果没有）
    if '.notification-panel {' not in content:
        content = content.replace('    </style>', NOTIFICATION_CSS + '    </style>')
        changes.append("添加通知面板CSS")
    
    # 2. 添加通知面板HTML（如果没有）
    if 'id="notifPanel"' not in content:
        content = content.replace('    </nav>\n', '    </nav>\n' + NOTIFICATION_HTML)
        changes.append("添加通知面板HTML")
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return changes
    return []

def fix_admin():
    """专门修复admin.html"""
    filepath = 'public/admin.html'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    changes = []
    
    # 1. 确保有通知面板CSS
    if '.notification-panel {' not in content:
        content = content.replace('    </style>', NOTIFICATION_CSS + '    </style>')
        changes.append("添加通知面板CSS")
    
    # 2. 确保有通知面板HTML
    if 'id="notifPanel"' not in content:
        content = content.replace('    </nav>\n', '    </nav>\n' + NOTIFICATION_HTML)
        changes.append("添加通知面板HTML")
    
    # 3. 给创建用户按钮添加id
    if 'id="createUserBtn"' not in content:
        content = content.replace(
            '<button class="btn btn-primary" onclick="openUserModal()">',
            '<button class="btn btn-primary" id="createUserBtn" onclick="openUserModal()">'
        )
        changes.append("给创建用户按钮添加id")
    
    # 4. 修改switchTab函数，隐藏/显示创建用户按钮
    old_func = '''function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            event?.target?.classList.add('active');

            // 更新导航栏高亮
            document.getElementById('navUserBtn')?.classList.toggle('active', tab === 'users');
            document.getElementById('navGroupBtn')?.classList.toggle('active', tab === 'groups');

            if (tab === 'users') {
                document.getElementById('usersSection').style.display = 'block';
                document.getElementById('groupsSection').style.display = 'none';
                document.getElementById('pageTitle').textContent = '用户管理';
            } else {
                document.getElementById('usersSection').style.display = 'none';
                document.getElementById('groupsSection').style.display = 'block';
                document.getElementById('pageTitle').textContent = '小组管理';
                loadGroups();
            }
        }'''
    
    new_func = '''function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            event?.target?.classList.add('active');

            // 更新导航栏高亮
            document.getElementById('navUserBtn')?.classList.toggle('active', tab === 'users');
            document.getElementById('navGroupBtn')?.classList.toggle('active', tab === 'groups');

            if (tab === 'users') {
                document.getElementById('usersSection').style.display = 'block';
                document.getElementById('groupsSection').style.display = 'none';
                document.getElementById('pageTitle').textContent = '用户管理';
                // 显示创建用户按钮
                const createBtn = document.getElementById('createUserBtn');
                if (createBtn) createBtn.style.display = 'flex';
            } else {
                document.getElementById('usersSection').style.display = 'none';
                document.getElementById('groupsSection').style.display = 'block';
                document.getElementById('pageTitle').textContent = '小组管理';
                // 隐藏创建用户按钮
                const createBtn = document.getElementById('createUserBtn');
                if (createBtn) createBtn.style.display = 'none';
                loadGroups();
            }
        }'''
    
    if old_func in content and 'createBtn' not in content:
        content = content.replace(old_func, new_func)
        changes.append("修复switchTab函数")
    
    # 5. 修复renderNotifications函数 - 移除insertAdjacentHTML逻辑
    if 'insertAdjacentHTML' in content:
        # 简单清理insertAdjacentHTML
        content = content.replace("document.querySelector('.notification-btn').insertAdjacentHTML('afterparent', notifHtml);", "// panel already exists")
        changes.append("清理insertAdjacentHTML")
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
    
    return changes

def fix_plan_list():
    """修复plan-list.html - 添加loadPlans(1)"""
    filepath = 'public/plan-list.html'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # 检查是否已有loadPlans(1)调用
    if 'loadPlans(1)' not in content:
        # 找到init函数的结尾，添加loadPlans(1)
        old_pattern = '''            // 加载未读通知数
            await loadNotificationCount();
        }

        function getRoleName'''
        
        new_pattern = '''            // 加载未读通知数
            await loadNotificationCount();
            
            // 加载计划列表
            loadPlans(1);
        }

        function getRoleName'''
        
        if old_pattern in content:
            content = content.replace(old_pattern, new_pattern)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return ["在init末尾添加loadPlans(1)"]
    
    return []

def fix_plan_edit():
    """修复plan-edit.html"""
    filepath = 'public/plan-edit.html'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    changes = []
    
    # 1. 添加通知面板CSS
    if '.notification-panel {' not in content:
        content = content.replace('    </style>', NOTIFICATION_CSS + '    </style>')
        changes.append("添加通知面板CSS")
    
    # 2. 添加通知面板HTML
    if 'id="notifPanel"' not in content:
        content = content.replace('    </nav>\n', '    </nav>\n' + NOTIFICATION_HTML)
        changes.append("添加通知面板HTML")
    
    # 3. 清理insertAdjacentHTML
    if 'insertAdjacentHTML' in content:
        content = content.replace("document.querySelector('.notification-btn').insertAdjacentHTML('afterparent', notifHtml);", "// panel already exists")
        changes.append("清理insertAdjacentHTML")
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
    
    return changes

def main():
    print("=" * 60)
    print("开始修复内控计划系统")
    print("=" * 60)
    
    all_changes = []
    
    # 修复admin.html
    changes = fix_admin()
    if changes:
        print("\n[admin.html] 修复:")
        for c in changes:
            print(f"  - {c}")
        all_changes.extend(changes)
    
    # 修复plan-list.html
    changes = fix_plan_list()
    if changes:
        print("\n[plan-list.html] 修复:")
        for c in changes:
            print(f"  - {c}")
        all_changes.extend(changes)
    
    # 修复plan-edit.html
    changes = fix_plan_edit()
    if changes:
        print("\n[plan-edit.html] 修复:")
        for c in changes:
            print(f"  - {c}")
        all_changes.extend(changes)
    
    # 修复import-export.html
    changes = fix_file('public/import-export.html')
    if changes:
        print("\n[import-export.html] 修复:")
        for c in changes:
            print(f"  - {c}")
        all_changes.extend(changes)
    
    # 修复operation-log.html
    changes = fix_file('public/operation-log.html')
    if changes:
        print("\n[operation-log.html] 修复:")
        for c in changes:
            print(f"  - {c}")
        all_changes.extend(changes)
    
    print("\n" + "=" * 60)
    if all_changes:
        print(f"修复完成! 共修复了 {len(all_changes)} 项")
    else:
        print("无需修复，所有项已正确")
    print("=" * 60)

if __name__ == '__main__':
    main()
