import re
import os

def replace_optional_chaining(line):
    count = 0
    
    for _ in range(10):
        if '?.' not in line:
            break
        
        idx = line.rfind('?.')
        if idx == -1:
            break
        
        prop_start = idx + 2
        prop_end = prop_start
        while prop_end < len(line) and (line[prop_end].isalnum() or line[prop_end] in '_$'):
            prop_end += 1
        prop_name = line[prop_start:prop_end]
        
        pos = idx - 1
        paren_count = 0
        bracket_count = 0
        
        while pos >= 0:
            c = line[pos]
            if c == ')':
                paren_count += 1
            elif c == '(':
                paren_count -= 1
                if paren_count < 0:
                    pos += 1
                    break
            elif c == ']':
                bracket_count += 1
            elif c == '[':
                bracket_count -= 1
                if bracket_count < 0:
                    pos += 1
                    break
            elif paren_count == 0 and bracket_count == 0:
                if c.isalnum() or c in '_$.':
                    pass
                else:
                    pos += 1
                    break
            pos -= 1
        
        if pos < 0:
            pos = 0
        
        expr = line[pos:idx]
        replacement = f'({expr} && {expr}.{prop_name})'
        line = line[:pos] + replacement + line[prop_end:]
        count += 1
    
    return line, count

public_dir = '/app/data/所有对话/主对话/项目代码/public'
total = 0

for filename in sorted(os.listdir(public_dir)):
    if not filename.endswith('.html'):
        continue
    filepath = os.path.join(public_dir, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    file_count = 0
    new_lines = []
    for i, line in enumerate(lines):
        new_line, cnt = replace_optional_chaining(line)
        new_lines.append(new_line)
        if cnt > 0:
            file_count += cnt
    
    if file_count > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        print(f'{filename}: 替换{file_count}处')
    else:
        print(f'{filename}: 无变化')
    total += file_count

print(f'\n总计: {total} 处')
