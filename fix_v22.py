#!/usr/bin/env python3
"""修复内控计划系统v22的3个问题"""

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

def fix_file(filepath, needs_css=True, needs_html=True, needs_render_fix=False, needs_switch_tab_fix=False, needs_init_fix=False):
    """通用修复函数"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    changes = []
    
    # 1. 添加通知面板CSS
    if needs_css and '.notification-panel {' not in content:
        content = content.replace('    </style>', NOTIFICATION_CSS + '    </style>')
        changes.append("添加通知面板CSS")
    
    # 2. 添加通知面板HTML
    if needs_html and 'id="notifPanel"' not in content:
        content = content.replace('    </nav>', '    </nav>\n' + NOTIFICATION_HTML)
        changes.append("添加通知面板HTML")
    
    # 3. 修复renderNotifications函数 - 删除insertAdjacentHTML
    if needs_render_fix and 'insertAdjacentHTML' in content:
        # 找到整个renderNotifications函数并替换
        import re
        # 匹配旧函数
        pattern = r'''function renderNotifications\(notifications\) \{
            const panel = document\.getElementById\('notifPanel'\);
            if \(!panel\) \{
                // 创建通知面板
                const notifHtml = `.*?`;\s*document\.querySelector\('\.notification-btn'\)\.insertAdjacentHTML\('afterparent', notifHtml\);\s*document\.addEventListener\('click', closeNotificationPanel\);
            \}
        \}'''
        
        new_func = '''function renderNotifications(notifications) {
            const notifList = document.getElementById('notifList');
            if (!notifList) return;
            
            if (notifications.length === 0) {
                notifList.innerHTML = '<div class="notification-empty">暂无通知</div>';
            } else {
                notifList.innerHTML = notifications.map(n => `
                    <div class="notification-item">
                        <div class="notification-icon">
                            <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
                        </div>
                        <div class="notification-content">
                            <div class="notification-text">${n.message || '新通知'}</div>
                            <div class="notification-time">${formatTime(n.created_at)}</div>
                        </div>
                    </div>
                `).join('');
            }
        }'''
        
        if re.search(pattern, content, re.DOTALL):
            content = re.sub(pattern, new_func, content, flags=re.DOTALL)
            changes.append("修复renderNotifications函数")
        elif 'insertAdjacentHTML' in content:
            # 简单替换
            content = content.replace("document.querySelector('.notification-btn').insertAdjacentHTML('afterparent', notifHtml);", "// panel already exists")
            changes.append("清理insertAdjacentHTML调用")
    
    # 4. 修复switchTab函数 - 隐藏/显示创建用户按钮
    if needs_switch_tab_fix:
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
        
        if old_func in content:
            content = content.replace(old_func, new_func)
            changes.append("修复switchTab函数添加创建用户按钮显示/隐藏")
        
        # 给创建用户按钮添加id
        if 'id="createUserBtn"' not in content:
            content = content.replace(
                '<button class="btn btn-primary" onclick="openUserModal()">',
                '<button class="btn btn-primary" id="createUserBtn" onclick="openUserModal()">'
            )
            changes.append("给创建用户按钮添加id")
    
    # 5. 修复init函数 - 添加loadPlans(1)
    if needs_init_fix:
        old_end = '''            // 加载未读通知数
            await loadNotificationCount();
        }

        function getRoleName'''
        
        new_end = '''            // 加载未读通知数
            await loadNotificationCount();
            
            // 加载计划列表
            loadPlans(1);
        }

        function getRoleName'''
        
        if old_end in content:
            content = content.replace(old_end, new_end)
            changes.append("在init末尾添加loadPlans(1)")
        elif 'await loadNotificationCount();' in content and 'loadPlans(1)' not in content:
            # 备用模式
            content = content.replace(
                'await loadNotificationCount();\n        }',
                'await loadNotificationCount();\n            \n            // 加载计划列表\n            loadPlans(1);\n        }'
            )
            changes.append("在init末尾添加loadPlans(1)[备用]")
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  修复 {filepath}:")
        for c in changes:
            print(f"    - {c}")
    
    return len(changes) > 0

def main():
    import os
    base_dir = os.path.dirname(os.path.abspath(__file__))
    pub_dir = os.path.join(base_dir, 'public')
    
    print("=" * 60)
    print("开始修复内控计划系统v22的3个问题")
    print("=" * 60)
    
    fixed_count = 0
    
    # 问题1: import-export.html 需要通知面板
    if fix_file(os.path.join(pub_dir, 'import-export.html'), needs_css=True, needs_html=True):
        fixed_count += 1
    
    # 问题1: operation-log.html 需要通知面板
    if fix_file(os.path.join(pub_dir, 'operation-log.html'), needs_css=True, needs_html=True):
        fixed_count += 1
    
    # 问题1: admin.html 需要通知面板 + 修复renderNotifications
    if fix_file(os.path.join(pub_dir, 'admin.html'), needs_css=True, needs_html=True, needs_render_fix=True, needs_switch_tab_fix=True):
        fixed_count += 1
    
    # 问题1: plan-edit.html 需要通知面板 + 修复renderNotifications
    if fix_file(os.path.join(pub_dir, 'plan-edit.html'), needs_css=True, needs_html=True, needs_render_fix=True):
        fixed_count += 1
    
    # 问题3: plan-list.html 需要在init末尾添加loadPlans(1)
    if fix_file(os.path.join(pub_dir, 'plan-list.html'), needs_css=False, needs_html=False, needs_render_fix=False, needs_init_fix=True):
        fixed_count += 1
    
    print("\n" + "=" * 60)
    print(f"修复完成! 共修复了 {fixed_count} 个文件")
    print("=" * 60)

if __name__ == '__main__':
    main()
