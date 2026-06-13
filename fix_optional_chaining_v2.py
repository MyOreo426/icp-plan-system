import re
import os

def replace_simple_patterns(content):
    """替换简单模式的?.，返回内容和替换次数"""
    count = 0
    
    # 模式1: data.data?.xxx 系列
    pattern1 = r'data\.data\?\.(\w+)'
    content, n = re.subn(pattern1, r'(data.data && data.data.\1)', content)
    count += n
    
    # 模式2: res.data?.xxx
    pattern2 = r'res\.data\?\.(\w+)'
    content, n = re.subn(pattern2, r'(res.data && res.data.\1)', content)
    count += n
    
    # 模式3: currentUser?.xxx
    pattern3 = r'currentUser\?\.(\w+)'
    content, n = re.subn(pattern3, r'(currentUser && currentUser.\1)', content)
    count += n
    
    # 模式4: filteredPlans[xxx]?.yyy
    pattern4 = r'filteredPlans\[([^\]]+)\]\?\.(\w+)'
    def repl4(m):
        idx = m.group(1)
        prop = m.group(2)
        return f'(filteredPlans[{idx}] && filteredPlans[{idx}].{prop})'
    content, n = re.subn(pattern4, repl4, content)
    count += n
    
    # 模式5: document.getElementById('xxx')?.yyy
    pattern5 = r"document\.getElementById\('([^']+)'\)\?\.(\w+)"
    def repl5(m):
        id_ = m.group(1)
        prop = m.group(2)
        return f"(document.getElementById('{id_}') && document.getElementById('{id_}').{prop})"
    content, n = re.subn(pattern5, repl5, content)
    count += n
    
    # 模式6: row.querySelector('xxx')?.value (单链)
    pattern6 = r"row\.querySelector\('([^']+)'\)\?\.value"
    def repl6(m):
        sel = m.group(1)
        return f"(row.querySelector('{sel}') && row.querySelector('{sel}').value)"
    # 注意：只替换后面没有 ?.trim() 的情况
    # 先替换单链的（后面直接跟 || 或其他）
    # 双链的单独处理
    content, n = re.subn(pattern6 + r'(?!\?\.)', repl6, content)
    count += n
    
    # 模式7: 双链 row.querySelector('xxx')?.value?.trim()
    pattern7 = r"row\.querySelector\('([^']+)'\)\?\.value\?\.trim\(\)"
    def repl7(m):
        sel = m.group(1)
        return f"(row.querySelector('{sel}') && row.querySelector('{sel}').value && row.querySelector('{sel}').value.trim())"
    content, n = re.subn(pattern7, repl7, content)
    count += n
    
    # 模式8: event?.target?.classList
    pattern8 = r'event\?\.target\?\.classList'
    content, n = re.subn(pattern8, r'(event && event.target && event.target.classList)', content)
    count += n
    
    return content, count

public_dir = '/app/data/所有对话/主对话/项目代码/public'
total = 0

for filename in sorted(os.listdir(public_dir)):
    if not filename.endswith('.html'):
        continue
    filepath = os.path.join(public_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content, count = replace_simple_patterns(content)
    
    if count > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'{filename}: 替换{count}处')
    else:
        print(f'{filename}: 无变化')
    total += count

print(f'\n总计: {total} 处')

# 检查是否还有遗漏的?.
remaining = 0
print('\n检查剩余未替换的?:')
for filename in sorted(os.listdir(public_dir)):
    if not filename.endswith('.html'):
        continue
    filepath = os.path.join(public_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f, 1):
            if '?.' in line:
                # 排除三元运算符 a ? b.c : d 的情况
                # 简单判断：?. 前面不是空格或字母数字
                import re
                if re.search(r'[a-zA-Z0-9_$)\]]\?\.', line):
                    print(f'  {filename}:{i}: {line.strip()[:100]}')
                    remaining += 1

print(f'\n剩余未替换: {remaining} 处')
