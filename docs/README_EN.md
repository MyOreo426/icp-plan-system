# Plan Management System

A multi-role collaborative plan management platform built with Node.js + Express + sql.js, featuring role-based access control, Excel-style editing, import/export, and operation log auditing.

English | [中文](./docs/README_CN.md)

## Features

- **Role-Based Access Control**: Four-level permissions — Member / Leader / Director / Admin, with data isolation by role
- **Plan Management**: Dual-view with card list + Excel-style spreadsheet, row-level locking, automatic overdue highlighting
- **Dashboard**: ECharts visualization (status distribution, group comparison, monthly trends, deadline alerts)
- **Import / Export**: CSV template import and export
- **Operation Log**: Structured recording of all edit / modify / delete actions for audit trail
- **Notification System**: In-app notifications, unread count, one-click read / cleanup

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js ≥18, Express.js |
| Database | sql.js (SQLite in-memory, async persistence) |
| Auth | JWT + bcryptjs, account lockout mechanism |
| Security | express-rate-limit, CORS whitelist, request body size limit |
| Frontend | Vanilla HTML / CSS / JS, ECharts 5.x |
| Deployment | Railway (auto-deploy), GitHub repository |

## Quick Start

```bash
# Install dependencies
npm install

# Start server
node server.js

# Open
open http://localhost:3000
```

## User Roles

| Role | Scope | Available Features |
|------|-------|--------------------|
| Member (MEMBER) | Own plans only | Dashboard, Plan List, Import/Export |
| Leader (LEADER) | All plans in own group | Dashboard, Plan List, Spreadsheet View, Import/Export, Operation Log |
| Director (DIRECTOR) | All plans | Dashboard, Plan List, Spreadsheet View, Import/Export, Operation Log |
| Admin (ADMIN) | System management | User Management, Group Management, Operation Log |

> Admin is redirected to User Management after login; other roles are redirected to the Dashboard.

## Frontend Pages

| Page | File | Description |
|------|------|-------------|
| Login | login.html | JWT login, role-based redirect |
| Dashboard | index.html | 4 stat cards + 6 ECharts charts |
| Plan List (Cards) | plan-list.html | Card-style list with filtering / pagination |
| Plan List (Spreadsheet) | plan-list-excel.html | Excel-style with auto-merge / color-coding / row-level locking / context menu |
| Plan Edit | plan-edit.html | Form editing with lock mutex, group-responsible linkage |
| Import / Export | import-export.html | CSV template import / export |
| Operation Log | operation-log.html | Structured audit log |
| Admin | admin.html | User Management + Group Management |

## Core Interaction Logic

### Group – Responsible Person Linkage

When editing a plan, **select the group first → the responsible person dropdown auto-filters to show only members of that group**. Selecting a responsible person also syncs the group in reverse. Changing the group clears the responsible person field, requiring re-selection.

### Spreadsheet Editing

- **Double-click** or **right-click context menu** to enter inline editing; the operation column only keeps the "Delete" button
- Group and responsible person dropdowns are linked during editing; required fields (category, group, responsible person) are validated before saving
- Row-level locking: only one user can edit a row at a time; auto-unlock after 30 minutes of inactivity

### Data Consistency

- User name / group name changes → plan list auto-syncs (JOIN query, no redundant name storage)
- Member promoted to Leader → auto-sets group leader_id; blocked if group already has a leader
- Leader demoted to non-Leader → auto-clears group leader_id
- User disabled → responsible person field cleared for their plans
- Group deletion → rejected if group has members or plans

## API Reference

### Auth `/api/auth`

| Method | Path | Description |
|--------|------|-------------|
| POST | /login | User login |
| POST | /logout | User logout |
| GET | /user/info | Get current user info |
| PUT | /password | Change password |

### Plans `/api/plans`

| Method | Path | Description |
|--------|------|-------------|
| GET | / | List plans (paginated, filtered by role) |
| GET | /:id | Get plan detail |
| POST | / | Create plan |
| PUT | /:id | Update plan (includes group_id sync) |
| DELETE | /:id | Soft delete plan |
| POST | /lock/:id | Lock plan (editing) |
| POST | /unlock/:id | Unlock plan |
| POST | /manual-unlock/:id | Force unlock (Leader / Admin) |
| POST | /import | Batch import plans |

### Users `/api/users`

| Method | Path | Description |
|--------|------|-------------|
| GET | / | List users (Admin / Director) |
| GET | /:id | Get user detail |
| POST | / | Create user (Admin) |
| PUT | /:id | Update user (includes role change sync) |
| PUT | /:id/password/reset | Reset password |
| PUT | /:id/disable | Disable user |
| PUT | /:id/enable | Enable user |

### Groups `/api/groups`

| Method | Path | Description |
|--------|------|-------------|
| GET | / | List groups |
| GET | /:id | Get group detail (includes member list) |
| POST | / | Create group (Admin) |
| PUT | /:id | Update group (Admin) |
| DELETE | /:id | Delete group (Admin; requires no members and no plans) |

### Notifications `/api/notifications`

| Method | Path | Description |
|--------|------|-------------|
| GET | / | List notifications |
| GET | /unread-count | Get unread count |
| PUT | /:id/read | Mark as read |
| PUT | /read-all | Mark all as read |
| DELETE | /clean-read | Clean up read notifications |

### Logs `/api/logs`

| Method | Path | Description |
|--------|------|-------------|
| GET | / | List operation logs |
| GET | /stats/summary | Get stats summary |
| GET | /:id | Get log detail |

## Database

SQLite (sql.js in-memory database with async persistence to `data/icp.db`):

| Table | Description |
|-------|-------------|
| sys_user | Users (with group_id FK) |
| sys_group | Groups (with leader_id FK) |
| icp_plan | Plans (with responsible_id, creator_id, group_id FKs) |
| sys_operation_log | Operation logs |
| sys_notification | Notifications |
| sys_login_attempt | Login attempt records |

## Project Structure

```
icp-plan-system/
├── server.js                # Express main entry
├── package.json
├── Procfile                 # Railway start file
├── docs/
│   ├── README_CN.md         # Chinese documentation
│   └── README_EN.md         # English documentation
│
├── db/
│   └── init.js              # Database init + seed data
│
├── middleware/
│   └── auth.js              # JWT auth middleware
│
├── routes/
│   ├── auth.js              # Auth routes
│   ├── plans.js             # Plan routes
│   ├── users.js             # User routes
│   ├── groups.js            # Group routes
│   ├── notifications.js     # Notification routes
│   └── logs.js              # Log routes
│
├── utils/
│   └── response.js          # Unified response utility
│
├── public/                  # Frontend static pages
│   ├── login.html           # Login
│   ├── index.html           # Dashboard
│   ├── plan-list.html       # Plan List (Cards)
│   ├── plan-list-excel.html # Plan List (Spreadsheet)
│   ├── plan-edit.html       # Plan Edit
│   ├── import-export.html   # Import / Export
│   ├── operation-log.html   # Operation Log
│   └── admin.html           # Admin
│
└── data/
    └── icp.db               # SQLite data file (generated at runtime)
```

## Deployment

### Railway (Current Setup)

1. Sign up on [Railway](https://railway.app) with GitHub
2. New Project → Deploy from GitHub repo → Select this repository
3. Railway auto-detects Node.js and runs `npm install && node server.js`
4. Set `JWT_SECRET` in Variables (optional; fallback key used if not set)

> ⚠️ Railway Trial does not support Volume persistence. Database is lost on container restart. For production, consider migrating to PostgreSQL (e.g., Supabase free tier).

### Local Deployment

```bash
git clone https://github.com/MyOreo426/icp-plan-system.git
cd icp-plan-system
npm install
node server.js
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| PORT | No | Server port, default 3000 (auto-injected by Railway) |
| NODE_ENV | No | Set to `production` to hide test account logs |
| JWT_SECRET | No | JWT signing secret; fallback used if not set |

## Test Accounts

| Role | Employee ID | Password | Group |
|------|-------------|----------|-------|
| Admin | 000000 | admin123 | — |
| Leader | MY | leader123 | Comprehensive Planning |
| Member | ZZY | member123 | Comprehensive Planning |
| Member | WMY | member123 | Comprehensive Planning |
| Leader | DH | leader123 | Customer Management |
| Member | A1 | member123 | Customer Management |
| Member | A2 | member123 | Customer Management |
| Member | A3 | member123 | Customer Management |

> Seed data includes 2 groups, 8 users, and 30 plans (5 per category across 6 categories).

## License

Private — Authorized use only
