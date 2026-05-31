# 计划管理系统 - 后端服务

## 项目简介

这是一个基于 Node.js + Express + SQLite 的计划管理系统后端服务。

## 技术栈

- **运行时**: Node.js
- **框架**: Express.js
- **数据库**: SQLite (better-sqlite3)
- **认证**: JWT (jsonwebtoken)
- **密码加密**: bcryptjs
- **跨域**: cors

## 快速开始

### 1. 安装依赖

```bash
cd 项目代码
npm install
```

### 2. 启动服务

```bash
node server.js
```

服务启动后访问: http://localhost:3000

## 测试账号

| 角色 | 工号 | 密码 | 说明 |
|------|------|------|------|
| 管理员 | 000000 | admin123 | 系统管理员，可管理所有数据 |
| 组长 | 100001 | leader123 | 小组负责人，管理本组计划 |
| 组员 | 100002 | member123 | 普通成员，管理自己的计划 |
| 主任 | 200001 | director123 | 部门主任，查看全部计划 |

## API 文档

### 认证接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 用户登录 |
| POST | /api/auth/logout | 用户登出 |
| GET | /api/auth/user/info | 获取当前用户信息 |
| PUT | /api/auth/password | 修改密码 |

### 计划接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/plans | 获取计划列表 |
| GET | /api/plans/:id | 获取计划详情 |
| POST | /api/plans | 创建计划 |
| PUT | /api/plans/:id | 更新计划 |
| DELETE | /api/plans/:id | 删除计划 |
| POST | /api/plans/lock/:id | 锁定计划 |
| POST | /api/plans/unlock/:id | 解锁计划 |
| POST | /api/plans/manual-unlock/:id | 强制解锁 |

### 用户接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/users | 获取用户列表 |
| GET | /api/users/:id | 获取用户详情 |
| POST | /api/users | 创建用户 |
| PUT | /api/users/:id | 更新用户 |
| PUT | /api/users/:id/password/reset | 重置密码 |
| PUT | /api/users/:id/disable | 禁用用户 |
| PUT | /api/users/:id/enable | 启用用户 |

### 小组接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/groups | 获取小组列表 |
| GET | /api/groups/:id | 获取小组详情 |
| POST | /api/groups | 创建小组 |
| PUT | /api/groups/:id | 更新小组 |

### 通知接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/notifications | 获取通知列表 |
| GET | /api/notifications/unread-count | 获取未读数量 |
| PUT | /api/notifications/:id/read | 标记已读 |
| PUT | /api/notifications/read-all | 全部标记已读 |

### 待办接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/todos | 获取未分配计划（组长用） |
| GET | /api/todos/my | 获取我的待办 |
| GET | /api/todos/expiring | 获取即将到期计划 |

### 日志接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/logs | 获取操作日志 |
| GET | /api/logs/:id | 获取日志详情 |
| GET | /api/logs/stats/summary | 获取统计信息 |

## 统一响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

## 角色权限

- **MEMBER (组员)**: 只能查看和管理自己负责的计划
- **LEADER (组长)**: 可查看和管理本组所有计划
- **DIRECTOR (主任)**: 可查看所有计划
- **ADMIN (管理员)**: 完整权限，包括用户和小组管理

## 数据库

数据库文件位于 `data/icp.db`，包含以下表：

- `sys_user` - 用户表
- `sys_group` - 小组表
- `icp_plan` - 计划表
- `sys_operation_log` - 操作日志表
- `sys_notification` - 消息通知表
- `sys_login_attempt` - 登录尝试记录表

## 项目结构

```
项目代码/
├── package.json
├── server.js              # 入口文件
├── db/
│   └── init.js            # 数据库初始化
├── middleware/
│   └── auth.js           # JWT认证中间件
├── routes/
│   ├── auth.js           # 认证路由
│   ├── plans.js          # 计划路由
│   ├── users.js          # 用户路由
│   ├── groups.js         # 小组路由
│   ├── notifications.js  # 通知路由
│   ├── todos.js          # 待办路由
│   └── logs.js           # 日志路由
├── utils/
│   └── response.js       # 统一响应工具
└── data/
    └── icp.db            # SQLite数据库
```
