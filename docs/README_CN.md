# 计划管理系统

基于 Node.js + Express + sql.js 的多角色计划协作管理平台，支持权限分级、Excel 风格编辑、导入导出、操作日志审计等功能。

[English](./docs/README_EN.md) | 中文

## 功能概览

- **多角色权限控制**：组员 / 组长 / 主任 / 管理员四级权限，数据按角色隔离
- **计划管理**：卡片列表 + Excel 风格表格双视图，行级锁定，超期自动标红
- **仪表盘**：ECharts 可视化统计（状态分布、组间对比、月度趋势、到期预警）
- **导入导出**：CSV 模板导入导出
- **操作日志**：结构化记录所有编辑 / 修改 / 删除操作，支持审计追溯
- **通知系统**：站内通知、未读计数、一键已读 / 清理

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js ≥18, Express.js |
| 数据库 | sql.js (SQLite in-memory, 异步持久化) |
| 认证 | JWT + bcryptjs, 账号锁定机制 |
| 安全 | express-rate-limit, CORS 白名单, 请求体大小限制 |
| 前端 | 原生 HTML / CSS / JS, ECharts 5.x |
| 部署 | Railway (自动部署), GitHub 仓库 |

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务
node server.js

# 访问
open http://localhost:3000
```

## 用户角色

| 角色 | 权限范围 | 可用功能 |
|------|---------|---------|
| 组员 (MEMBER) | 仅自己创建的计划 | 仪表盘、计划列表、导入导出 |
| 组长 (LEADER) | 本组全部计划 | 仪表盘、计划列表、表格版、导入导出、操作日志 |
| 主任 (DIRECTOR) | 所有计划 | 仪表盘、计划列表、表格版、导入导出、操作日志 |
| 管理员 (ADMIN) | 系统管理 | 用户管理、小组管理、操作日志 |

> 管理员登录后自动跳转至用户管理界面，其他角色登录后跳转至仪表盘。

## 前端页面

| 页面 | 文件 | 说明 |
|------|------|------|
| 登录 | login.html | JWT 登录，按角色跳转首页 |
| 仪表盘 | index.html | 4 统计卡片 + 6 ECharts 图表 |
| 计划列表（卡片版） | plan-list.html | 卡片式列表，筛选 / 分页 |
| 计划列表（表格版） | plan-list-excel.html | Excel 风格，自动合并 / 标色 / 行级锁定 / 右键菜单 |
| 计划编辑 | plan-edit.html | 表单编辑，锁定互斥，所属组 - 责任人联动 |
| 导入导出 | import-export.html | CSV 模板导入 / 导出 |
| 操作日志 | operation-log.html | 结构化审计日志 |
| 系统管理 | admin.html | 用户管理 + 小组管理 |

## 核心交互逻辑

### 所属组 - 责任人联动

编辑计划时，**先选所属组 → 责任人下拉自动过滤为该组成员**；选责任人也会反向同步所属组。切换所属组时责任人自动清空，需重新选择。

### 表格版编辑

- **双击**或**右键菜单**进入行内编辑，操作列只保留"删除"按钮
- 编辑时所属组、责任人下拉联动，保存前校验必填字段（类别、所属组、责任人）
- 行级锁定：同一行同时只能一人编辑，超时 30 分钟自动解锁

### 数据一致性

- 用户姓名、小组名称变更 → 计划列表自动同步（JOIN 查询，不冗余存储名称）
- 组员升为组长 → 自动设置小组 leader_id，已有组长的会拦截
- 组长降为非组长 → 自动清除小组 leader_id
- 禁用用户 → 该用户负责 / 创建的计划责任人置空
- 删除小组 → 有成员或有计划时拒绝删除

## API 接口

### 认证 `/api/auth`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /login | 用户登录 |
| POST | /logout | 用户登出 |
| GET | /user/info | 获取当前用户信息 |
| PUT | /password | 修改密码 |

### 计划 `/api/plans`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 获取计划列表（分页，按角色过滤） |
| GET | /:id | 获取计划详情 |
| POST | / | 创建计划 |
| PUT | /:id | 更新计划（含 group_id 同步） |
| DELETE | /:id | 软删除计划 |
| POST | /lock/:id | 锁定计划（编辑中） |
| POST | /unlock/:id | 解锁计划 |
| POST | /manual-unlock/:id | 强制解锁（组长 / 管理员） |
| POST | /import | 批量导入计划 |

### 用户 `/api/users`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 获取用户列表（管理员 / 主任） |
| GET | /:id | 获取用户详情 |
| POST | / | 创建用户（管理员） |
| PUT | /:id | 更新用户（含角色变更同步） |
| PUT | /:id/password/reset | 重置密码 |
| PUT | /:id/disable | 禁用用户 |
| PUT | /:id/enable | 启用用户 |

### 小组 `/api/groups`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 获取小组列表 |
| GET | /:id | 获取小组详情（含成员列表） |
| POST | / | 创建小组（管理员） |
| PUT | /:id | 更新小组（管理员） |
| DELETE | /:id | 删除小组（管理员，需无成员和计划） |

### 通知 `/api/notifications`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 获取通知列表 |
| GET | /unread-count | 获取未读数量 |
| PUT | /:id/read | 标记已读 |
| PUT | /read-all | 全部标记已读 |
| DELETE | /clean-read | 清理已读通知 |

### 日志 `/api/logs`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 获取操作日志 |
| GET | /stats/summary | 获取统计摘要 |
| GET | /:id | 获取日志详情 |

## 数据库

SQLite（sql.js 内存数据库，写后持久化到 `data/icp.db`），包含以下表：

| 表名 | 说明 |
|------|------|
| sys_user | 用户表（含 group_id 外键） |
| sys_group | 小组表（含 leader_id 外键） |
| icp_plan | 计划表（含 responsible_id, creator_id, group_id 外键） |
| sys_operation_log | 操作日志表 |
| sys_notification | 通知表 |
| sys_login_attempt | 登录尝试记录表 |

## 项目结构

```
icp-plan-system/
├── server.js                # Express 主服务入口
├── package.json
├── Procfile                 # Railway 启动文件
├── docs/
│   ├── README_CN.md         # 中文文档
│   └── README_EN.md         # English Documentation
│
├── db/
│   └── init.js              # 数据库初始化 + 种子数据
│
├── middleware/
│   └── auth.js              # JWT 认证中间件
│
├── routes/
│   ├── auth.js              # 认证路由
│   ├── plans.js             # 计划路由
│   ├── users.js             # 用户路由
│   ├── groups.js            # 小组路由
│   ├── notifications.js     # 通知路由
│   └── logs.js              # 日志路由
│
├── utils/
│   └── response.js          # 统一响应工具
│
├── public/                  # 前端静态页面
│   ├── login.html           # 登录
│   ├── index.html           # 仪表盘
│   ├── plan-list.html       # 计划列表（卡片版）
│   ├── plan-list-excel.html # 计划列表（表格版）
│   ├── plan-edit.html       # 计划编辑
│   ├── import-export.html   # 导入导出
│   ├── operation-log.html   # 操作日志
│   └── admin.html           # 系统管理
│
└── data/
    └── icp.db               # SQLite 数据文件（运行时生成）
```

## 部署

### Railway（当前方案）

1. 注册 [Railway](https://railway.app)，用 GitHub 登录
2. New Project → Deploy from GitHub repo → 选择此仓库
3. Railway 自动检测 Node.js，执行 `npm install && node server.js`
4. 在 Variables 中设置 `JWT_SECRET`（可选，不设则用兜底密钥）

> ⚠️ Railway Trial 不支持 Volume 持久化，容器重启后数据库会丢失。生产环境建议迁移至 PostgreSQL（如 Supabase 免费版）。

### 本地部署

```bash
git clone https://github.com/MyOreo426/icp-plan-system.git
cd icp-plan-system
npm install
node server.js
```

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| PORT | 否 | 服务端口，默认 3000（Railway 自动注入） |
| NODE_ENV | 否 | 设为 production 时隐藏测试账号日志 |
| JWT_SECRET | 否 | JWT 签名密钥，不设则使用兜底值 |

## 测试账号

| 角色 | 工号 | 密码 | 所属组 |
|------|------|------|--------|
| 管理员 | 000000 | admin123 | — |
| 组长 | MY | leader123 | 综合计划组 |
| 组员 | ZZY | member123 | 综合计划组 |
| 组员 | WMY | member123 | 综合计划组 |
| 组长 | DH | leader123 | 客户管理组 |
| 组员 | A1 | member123 | 客户管理组 |
| 组员 | A2 | member123 | 客户管理组 |
| 组员 | A3 | member123 | 客户管理组 |

> 种子数据包含 2 个小组、8 个用户、30 条计划（6 个类别各 5 条）。

## License

Private - 仅供授权使用
