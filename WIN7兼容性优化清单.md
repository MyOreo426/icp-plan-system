# Win7 兼容性优化清单

## 已完成 ✅

### 1. 前端 `?.` 可选链语法替换（42处）
- **问题**：可选链 `?.` 是 ES2020 语法，老版本浏览器（Chrome < 80）不支持，会导致 JS 执行中断
- **影响范围**：6个页面
  - admin.html: 9处
  - import-export.html: 3处
  - operation-log.html: 4处
  - plan-edit.html: 2处
  - plan-list-excel.html: 17处
  - plan-list.html: 7处
- **修复方式**：全部替换为传统 `&&` 判断写法
  - 单链：`data.data?.list` → `(data.data && data.data.list)`
  - 双链：`event?.target?.classList` → `(event && event.target && event.target.classList)`
  - 函数调用链：`row.querySelector('x')?.value?.trim()` → `(row.querySelector('x') && row.querySelector('x').value && row.querySelector('x').value.trim())`

### 2. 后端 Node 12 兼容性（此前已完成）
- 修复后端 `?.` 和 `??` 语法
- sql.js 降级到 1.0.0
- express-rate-limit 降级

## 待验证 / 待优化 ⏳

### 1. ECharts 5.x 版本兼容性
- **说明**：当前使用 ECharts 5.x CDN 版本
- **潜在风险**：如果浏览器内核过老，可能存在兼容性问题
- **验证方法**：Win7 上访问仪表盘，查看图表是否正常渲染
- **备选方案**：降级到 ECharts 4.x

### 2. 其他 ES6+ 语法检查（低风险）
以下语法在 Chrome 109 上均支持，但若奇安信浏览器内核版本过低可能有问题：
- 箭头函数 `=>`（ES6，Chrome 45+）- 约109处
- `async/await`（ES2017，Chrome 55+）- 约163处
- 模板字符串（ES6，Chrome 41+）
- `let/const`（ES6，Chrome 49+）
- `Array.prototype.includes`（ES2016，Chrome 47+）
- `Object.values`（ES2017，Chrome 54+）
- `String.prototype.padStart`（ES2017，Chrome 57+）
- 展开运算符 `...`（ES6，Chrome 46+）

### 3. CSS 兼容性（低风险）
- Flex 布局（IE10+ 部分支持，Chrome 29+ 完整支持）
- CSS 变量（IE 不支持，Chrome 49+ 支持）
- `gap` 属性（Chrome 84+ 支持 flex gap）

### 4. Win7 兼容版 exe 重新打包
- 目前 pkg 打包工具安装中，待重新打包 node12 版本 exe

## 测试建议

1. 优先在 Win7 的 Chrome 浏览器（版本109）上测试，确认 `?.` 修复后仪表盘是否正常
2. 再用奇安信浏览器测试，确认是否有其他兼容性问题
3. 重点测试页面：仪表盘、重点任务列表、表格版列表
