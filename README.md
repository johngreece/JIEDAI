# 借款业务管理系统 (Loan Management System)

内部可控、流程完整、留痕清晰的**非银行场景**借款管理系统。资金可追溯，合同可签署，还款可确认，全流程可审计。

---

## 技术栈

- **前端**: Next.js 14 (App Router)、React 18、TypeScript、纯 CSS
- **后端**: Next.js API Routes
- **数据库**: PostgreSQL（Supabase）+ Prisma
- **认证**: JWT (jose) + Cookie、RBAC

---

## 本地运行

```bash
# 安装依赖
npm install

# 配置环境变量（复制 .env.example 为 .env，将 [YOUR-PASSWORD] 替换为 Supabase 数据库密码）
cp .env.example .env
# Supabase 密码：控制台 → Project Settings → Database → Connection string → 复制密码

# 生成 Prisma Client 并同步/迁移数据库
npm run db:generate
npm run db:push
# 可选：写入默认合同模板与费率配置
npm run db:seed

# 启动开发服务器（默认端口 3001，避免与 3000 冲突）
npm run dev
```

**访问地址**: [http://localhost:3001](http://localhost:3001)

- 首页：进入工作台或登录  
- 工作台：`/dashboard`  
- 登录：`/login`  

生产环境启动：`npm run start`（同样使用 3001 端口）。

---

## 项目结构

```
├── prisma/
│   └── schema.prisma          # 数据模型
├── src/
│   ├── app/
│   │   ├── api/                # API 路由（auth、dashboard、client 等）
│   │   ├── dashboard/          # 工作台
│   │   ├── login/              # 登录
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   └── dashboard/          # 工作台汇总卡片
│   └── lib/
│       ├── prisma.ts
│       ├── auth.ts
│       ├── audit.ts
│       ├── repayment-confirm.ts
│       └── contract-engine/
├── docs/                       # 设计与测试文档
├── package.json
├── tsconfig.json
└── next.config.js
```

---

## 文档索引

| 文档 | 说明 |
|------|------|
| [01-system-module-diagram.md](docs/01-system-module-diagram.md) | 系统模块图 |
| [02-database-er-design.md](docs/02-database-er-design.md) | 数据库 ER 与表结构 |
| [03-flow-diagrams.md](docs/03-flow-diagrams.md) | 五大流程图 |
| [04-backend-menu-structure.md](docs/04-backend-menu-structure.md) | 后台菜单与路由 |
| [05-PRD-product-requirements.md](docs/05-PRD-product-requirements.md) | PRD 产品需求文档 |
| [06-API-list.md](docs/06-API-list.md) | API 清单 |
| [07-contract-variable-engine.md](docs/07-contract-variable-engine.md) | 合同变量引擎设计 |
| [08-test-cases.md](docs/08-test-cases.md) | 测试用例 |
| [POSTCSS-AUDIT.md](docs/POSTCSS-AUDIT.md) | PostCSS 配置审计说明 |

---

## 已实现要点

- **PRD / API 清单**: 见 `docs/05`、`docs/06`
- **前后端骨架**: Next.js + Prisma，工作台、登录、`/api/auth/me`、`/api/dashboard/summary`
- **合同变量引擎**: `src/lib/contract-engine`（`{{ var }}` 解析、填充、必填校验）
- **还款确认与审计**: `repayment-confirm.ts` 状态机 + `audit.ts`；客户端确认 API
- **工作台**: 12 项 KPI 卡片，加载态与错误态
- **测试**: `docs/08` 测试用例；`src/lib/contract-engine/variables.test.ts` 单元测试（`npm run test`）

---

## 端口说明

- 开发与生产均使用 **3001**（`npm run dev` / `npm run start` 已带 `-p 3001`），不占用 3000。
- 若需改用其他端口：在 `package.json` 的 `dev` / `start` 脚本中修改 `-p 端口号`。

---

## 后续可做

- 接入 bcrypt 做密码哈希
- 菜单与 RBAC 中间件
- 合同 HTML 转 PDF
- 更多 API 与业务页面
- E2E 与接口自动化测试
