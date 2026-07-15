# 借款管理系统执行计划（内部自用 / EUR / 免费层）— 2026-07-15

## 0. 上下文

- 输入：全链路审计、`14-internal-eur-free-tier-target-blueprint.md`、最新 `main`。
- 团队假设：以单人/小团队持续迭代为主，产品、开发、QA 和财务运营职责可由同一人兼任，但每个任务仍保留唯一主责角色。
- 节奏：一周一个小里程碑，按 75% 容量计划，保留生产故障和人工运营缓冲。
- 硬约束：EUR、Supabase 生产库、内部签字留痕、免费层部署。

## 1. 里程碑路线

| # | 里程碑 | 目标 | 退出条件 | 粗略周期 |
|---|---|---|---|---|
| M1 | 基础约束 | 固化 EUR、免费层调度、CI 和单一来源 | 静态检查、单测和构建通过 | 1 周 |
| M2 | 生产数据库恢复 | 新 Supabase 项目可连接、迁移、种子和健康检查通过 | 三端能登录且核心表完整 | 1 周 |
| M3 | 状态与资金一致性 | 统一状态机、原子资金事件、冲正和对账 | 并发/重复调用不产生坏账 | 2-3 周 |
| M4 | 三端闭环 | 管理端、客户端、资金方核心流程可完整操作 | 真实库 E2E 全通过 | 1-2 周 |
| M5 | 免费层运营 | 备份、恢复演练、容量检查和运行手册齐备 | 可在无开发介入时按手册恢复 | 1 周 |

M1 先消除当前免费层部署阻断，并给后续改动建立门禁；M2 解决目前唯一的真实全链路阻塞，即旧 Supabase 项目不可达。M3 在真实数据库可用后集中处理高风险的状态和资金一致性。M4 才统一三端体验并跑业务闭环，避免在错误状态模型上反复改页面。M5 把免费层缺失的备份和运维能力补齐。

## 2. 按角色拆分任务

### 2.1 Product

### PROD-001 · 冻结业务状态与终态矩阵
- **Role**: product  (contributors: backend, finance/ops)
- **Objective**: 为借款、合同、放款、还款、逾期、结算和提现建立唯一可执行状态图。
- **Problem being solved**: blueprint moves 3-4；状态定义分散。
- **Scope of change**:
  - 业务状态表 — 定义进入条件、合法下一状态、拒绝分支和终态。
  - 操作权限表 — 定义每个动作允许的角色。
- **Out of scope**: 新增贷款产品或定价策略。
- **Related modules**: Loan Lifecycle, Contract, Disbursement, Repayment, Funder Capital
- **Expected result**: 开发和测试可从同一状态矩阵生成规则和用例。
- **Acceptance criteria**:
  - [ ] 每条主链路都有成功、拒绝、取消和异常终态。
  - [ ] 任意状态不存在两个含义相同但名称不同的别名。
  - [ ] 每个资金动作都标明前置状态和主责角色。
- **Priority**: P1
- **Size**: M  (rationale: 涉及多个现有工作流但不改数据库)
- **Depends on**: SYS-001
- **Blocks**: BE-001, QA-002

### 2.2 Design

### DES-001 · 统一三端操作反馈
- **Role**: design  (contributors: frontend, product)
- **Objective**: 让内部人员能明确看到当前状态、下一动作和失败恢复方式。
- **Problem being solved**: 页面局部状态表和错误反馈不一致。
- **Scope of change**:
  - 三端核心列表/详情 — 状态、主操作、空态、错误态和成功反馈规范。
  - 高风险动作 — 二次确认和结果摘要。
- **Out of scope**: 品牌重设计和营销页面。
- **Related modules**: Admin, Client, Funder portals
- **Expected result**: 同一业务状态在三端使用同一文案和颜色语义。
- **Acceptance criteria**:
  - [ ] 借款、放款、还款、结算均标出下一可执行动作。
  - [ ] 错误反馈包含原因和恢复动作。
  - [ ] 移动端不存在操作按钮遮挡或金额溢出。
- **Priority**: P2
- **Size**: M  (rationale: 需要覆盖多个页面但不改变业务逻辑)
- **Depends on**: PROD-001
- **Blocks**: FE-002

### 2.3 Frontend

### FE-001 · 全站 EUR 展示收口
- **Role**: frontend  (contributors: backend)
- **Objective**: 所有金额从统一格式器输出 EUR，消除手写 `EUR`、`€` 和局部格式函数。
- **Problem being solved**: blueprint invariant 1 and SoT currency declaration。
- **Scope of change**:
  - `src/lib/system-config.ts` — 唯一币种和金额格式器。
  - 三端页面、通知和合同变量 — 迁移到统一格式器。
- **Out of scope**: 多币种和汇率换算。
- **Related modules**: all portals, Notifications, Contract
- **Expected result**: EUR 格式一致且代码中无其他币种。
- **Acceptance criteria**:
  - [ ] 金额统一显示两位小数和 EUR 符号。
  - [ ] CI 拒绝 `USD`、`CNY`、`RMB` 业务声明。
  - [ ] 格式器覆盖负数、零、小数和 Decimal 字符串测试。
- **Priority**: P1
- **Size**: M  (rationale: 单一工具简单，但消费者较多)
- **Depends on**: SYS-001
- **Blocks**: FE-002

### FE-002 · 三端核心页状态与错误统一
- **Role**: frontend  (contributors: design, QA)
- **Objective**: 统一管理端、客户端和资金方端的状态、加载、空态和失败恢复。
- **Problem being solved**: blueprint move 7。
- **Scope of change**:
  - 核心列表和详情页 — 使用共享状态元数据和反馈组件。
  - 写操作 — 明确 pending/success/error 状态并防重复提交。
- **Out of scope**: 非核心设置页重构。
- **Related modules**: Admin, Client, Funder portals
- **Expected result**: 操作员无需猜测下一步或刷新确认结果。
- **Acceptance criteria**:
  - [ ] 主链路页面均有加载、空、错、成功四类反馈。
  - [ ] 写按钮请求期间禁用且不会重复提交。
  - [ ] Playwright 桌面和移动视口无重叠。
- **Priority**: P2
- **Size**: L  (rationale: 跨三端多个核心页面)
- **Depends on**: DES-001, FE-001, BE-001
- **Blocks**: QA-003

### 2.4 Backend

### SYS-001 · 固化系统运行约束
- **Role**: backend  (contributors: QA)
- **Objective**: 把 EUR、免费层 Cron 和环境约束变成可测试代码。
- **Problem being solved**: blueprint move 1。
- **Scope of change**:
  - `src/lib/system-config.ts` — EUR 单一来源。
  - `scripts/check-system-invariants.js` — 币种、Cron 和环境约束检查。
  - CI/health check — 运行约束检查。
- **Out of scope**: 业务状态机。
- **Related modules**: System Configuration, CI
- **Expected result**: 违反固定约束的提交无法通过 CI。
- **Acceptance criteria**:
  - [ ] `SYSTEM_CURRENCY` 固定为 `EUR`。
  - [ ] Vercel Hobby Cron 不包含每日多次表达式。
  - [ ] 本地和 CI 可单独运行 invariant check。
- **Priority**: P0
- **Size**: S  (rationale: 小范围基础模块和脚本)
- **Depends on**: none
- **Blocks**: PROD-001, FE-001, OPS-001

### OPS-001 · 建立免费层每日维护编排
- **Role**: backend  (contributors: QA, finance/ops)
- **Objective**: 用每日一次可观测、可重复执行的维护链替代 4 个高频 Cron。
- **Problem being solved**: 当前 `vercel.json` 在 Hobby 计划上会部署失败。
- **Scope of change**:
  - Daily Maintenance service — 依次运行逾期、结算、提醒和重试。
  - `/api/cron/daily` — 统一鉴权和结果摘要。
  - `vercel.json` — 仅保留每日一次计划。
- **Out of scope**: 分钟级实时调度和付费队列。
- **Related modules**: Overdue, Settlement, Notifications, Message Delivery
- **Expected result**: 免费层部署成功，每日任务任一阶段失败不会阻止其余阶段。
- **Acceptance criteria**:
  - [ ] 未配置或错误 `CRON_SECRET` 时拒绝执行。
  - [ ] 每个阶段返回成功、耗时和错误摘要。
  - [ ] 重复调用不会重复生成资金记录或通知。
  - [ ] 单个阶段失败时后续阶段继续执行，最终响应标记失败。
- **Priority**: P0
- **Size**: M  (rationale: 编排简单，但涉及多个有副作用服务)
- **Depends on**: SYS-001
- **Blocks**: DB-001, QA-001

### BE-001 · 建立统一业务状态机
- **Role**: backend  (contributors: product, QA)
- **Objective**: 所有状态迁移通过领域函数校验并记录审计。
- **Problem being solved**: blueprint move 3。
- **Scope of change**:
  - 借款/合同/放款/还款状态模块 — 合法迁移和终态。
  - API 路由 — 移除直接状态写入。
  - 审计日志 — 记录 from/to/action/operator。
- **Out of scope**: UI 样式调整。
- **Related modules**: Loan Lifecycle, Contract, Disbursement, Repayment
- **Expected result**: 非法跳转在事务开始前被拒绝。
- **Acceptance criteria**:
  - [ ] 状态矩阵全部有单测。
  - [ ] API 无绕过状态机的主链路状态更新。
  - [ ] 终态不可重新进入活动状态，除非存在显式恢复动作。
- **Priority**: P1
- **Size**: XL  (rationale: 跨多个路由和服务且回归面大)
- **Depends on**: PROD-001
- **Blocks**: FIN-001, FE-002, QA-002

### 2.5 Database

### DB-001 · 恢复 Supabase 生产数据库
- **Role**: database  (contributors: backend, QA)
- **Objective**: 建立可用的新 Supabase 免费项目并恢复完整生产 schema。
- **Problem being solved**: 当前旧项目域名不可解析，真实全链路被阻断。
- **Scope of change**:
  - Supabase 项目 — 新建/恢复项目、获取 transaction/session pooler 地址。
  - Prisma — generate、push/migrate、seed、RLS 和基础设施表检查。
  - Vercel/GitHub Secrets — 更新连接和鉴权变量。
- **Out of scope**: 升级 Supabase Pro。
- **Related modules**: Database, Deployment, Auth
- **Expected result**: 生产候选环境连接成功并完成基础数据初始化。
- **Acceptance criteria**:
  - [ ] `DATABASE_URL` 使用 Supavisor transaction mode 6543。
  - [ ] `DIRECT_URL` 可从迁移环境连接。
  - [ ] `npm run db:push`, `db:seed`, `db:enable-rls`, `health-check` 全通过。
  - [ ] `npm run storage:ensure` 成功，bucket 为私有且限制文件类型/大小。
  - [ ] `npm run storage:migrate-base64` dry-run 返回历史 Base64 数量为 0。
  - [ ] 三端测试账号可登录。
- **Priority**: P0
- **Size**: M  (rationale: 代码少但依赖外部项目配置和数据恢复)
- **Depends on**: OPS-001
- **Blocks**: FIN-001, QA-002, OPS-002

### OPS-002 · 建立免费层备份与恢复演练
- **Role**: database  (contributors: finance/ops, QA)
- **Objective**: 补偿 Supabase Free 无自动备份的缺口。
- **Problem being solved**: blueprint invariant 10。
- **Scope of change**:
  - GitHub Actions — 每周 `pg_dump`、加密和短期 artifact。
  - 恢复脚本/手册 — 在临时数据库验证恢复。
  - 容量检查 — 数据库和存储红线。
- **Out of scope**: PITR 和付费长期归档。
- **Related modules**: Audit & Operations, Supabase
- **Expected result**: 至少存在一份可验证恢复的加密备份。
- **Acceptance criteria**:
  - [ ] 备份不以明文存储，密钥不进入仓库。
  - [ ] 每周任务失败会在 GitHub Actions 显示失败。
  - [ ] 每月至少一次恢复到临时库并执行表数量/关键金额校验。
- **Priority**: P1
- **Size**: M  (rationale: 自动化不复杂，但恢复验证需要真实数据库)
- **Depends on**: DB-001
- **Blocks**: QA-003

### 2.6 QA / Audit

### QA-001 · 建立主分支 CI 门禁
- **Role**: QA  (contributors: backend)
- **Objective**: 每次提交自动执行约束检查、类型检查、单测和生产构建。
- **Problem being solved**: blueprint architecture principle 8。
- **Scope of change**:
  - GitHub Actions CI — npm ci、invariants、tsc、vitest、next build。
  - 分支保护说明 — 合并前必须通过。
- **Out of scope**: 真实数据库 E2E。
- **Related modules**: CI, all code
- **Expected result**: 基础回归在合并前被拦截。
- **Acceptance criteria**:
  - [ ] pull request 和 main push 均触发 CI。
  - [ ] 任一步失败导致 job 失败。
  - [ ] CI 不依赖生产数据库密钥即可完成。
- **Priority**: P0
- **Size**: S  (rationale: 单一工作流文件)
- **Depends on**: SYS-001, OPS-001
- **Blocks**: QA-002

### QA-002 · 资金与状态并发回归
- **Role**: QA  (contributors: backend, database, finance/ops)
- **Objective**: 证明重复请求和并发请求不会重复放款、还款、结算或越过状态。
- **Problem being solved**: blueprint invariants 2-5。
- **Scope of change**:
  - 集成测试 — 放款、还款确认、分配、结算、提现。
  - 故障注入 — 事务中间失败和重试。
- **Out of scope**: 性能压测。
- **Related modules**: Loan Lifecycle, Finance Ledger, Funder Capital
- **Expected result**: 资金记录、台账和余额在并发后仍一致。
- **Acceptance criteria**:
  - [ ] 同一幂等键并发 10 次只产生一个业务结果。
  - [ ] 不同请求争抢同一余额时不会出现负余额。
  - [ ] 对账脚本在测试完成后零差异。
- **Priority**: P1
- **Size**: L  (rationale: 需要真实 PostgreSQL 和多条资金链)
- **Depends on**: PROD-001, BE-001, DB-001, QA-001
- **Blocks**: FIN-001, QA-003

### QA-003 · 三端真实库全链路验收
- **Role**: QA  (contributors: frontend, backend, finance/ops)
- **Objective**: 在生产候选 Supabase 上验证客户、管理、资金方完整闭环。
- **Problem being solved**: blueprint move 8。
- **Scope of change**:
  - Playwright/API regression — 登录、申请、审批、签字、放款、还款、结算、提现。
  - 桌面/移动截图 — 核心页面视觉烟测。
- **Out of scope**: 大规模负载测试。
- **Related modules**: all portals and business modules
- **Expected result**: 发布前存在可重复的全链路证据。
- **Acceptance criteria**:
  - [ ] 三端主链路无人工改库即可走到终态。
  - [ ] 失败分支和权限越权测试通过。
  - [ ] 财务对账和健康检查均为零失败。
- **Priority**: P1
- **Size**: L  (rationale: 跨三端、真实数据库和外部触点)
- **Depends on**: FE-002, OPS-002, QA-002
- **Blocks**: none

### 2.7 Finance / Operations

### FIN-001 · 资金事件、冲正和对账闭环
- **Role**: finance/ops  (contributors: backend, database, QA)
- **Objective**: 每一笔 EUR 资金变化都可从业务单据追到客户台账和资金方流水。
- **Problem being solved**: blueprint move 4-5。
- **Scope of change**:
  - 资金事件矩阵 — 借方/贷方、引用类型、金额和余额影响。
  - 冲正流程 — 原分录与冲正分录关联。
  - 对账报告 — 差异分级和处理动作。
- **Out of scope**: 法定会计报表和税务申报。
- **Related modules**: Disbursement, Repayment, Ledger, Settlement, Withdrawal
- **Expected result**: 任一资金单据可双向追溯，错账无需删除原记录。
- **Acceptance criteria**:
  - [ ] 所有资金事件都有唯一 reference type/id。
  - [ ] 已确认记录无直接删除路径。
  - [ ] 冲正后余额、累计流入/流出和对账结果一致。
  - [ ] 每日差异为零或有明确责任人和处理状态。
- **Priority**: P1
- **Size**: XL  (rationale: 资金规则、后端事务、数据库约束和运营流程同时变化)
- **Depends on**: BE-001, DB-001, QA-002
- **Blocks**: QA-003

## 3. 依赖图

- **M1** — `SYS-001` → `OPS-001` → `QA-001`；`SYS-001` → `FE-001`。
- **M2** — `OPS-001` → `DB-001`。
- **M3** — `SYS-001` → `PROD-001` → `BE-001` → `QA-002` → `FIN-001`。
- **M4** — `PROD-001` → `DES-001`；`DES-001 + FE-001 + BE-001` → `FE-002`。
- **M5** — `DB-001` → `OPS-002`；`FE-002 + OPS-002 + QA-002 + FIN-001` → `QA-003`。
- **可并行流**：M1 的 EUR 收口和每日维护可并行；M3 的状态机开发与 M4 的设计规范可并行；数据库备份与前端页面统一可并行。

## 4. 关键路径

`SYS-001 → OPS-001 → DB-001 → PROD-001 → BE-001 → QA-002 → FIN-001 → QA-003`

粗略关键路径：6-9 周，主要不确定性在 Supabase 恢复、跨模块状态机和资金并发测试。

## 5. 交付风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 新 Supabase 项目凭证尚未配置 | M2 及真实 E2E 阻塞 | 代码先完成免费层适配；项目创建后立即跑自动健康检查 |
| Vercel Hobby 仅保证每日一次且小时级精度 | 逾期/通知最多延迟一天 | 内部后台保留手动扫描；业务页面读取时做必要的惰性校验 |
| Supabase Free 无自动备份 | 数据恢复能力不足 | M5 前完成每周加密备份和月度恢复演练 |
| 状态判断散落范围大 | 状态机迁移引入回归 | 按模块渐进迁移，每个模块先补状态矩阵测试 |
| 单人开发同时承担多角色 | 计划被日常运营打断 | 按 75% 容量排期，每个里程碑保持可独立发布 |

## 6. 启动前已确认事项

- 系统为内部自用。
- 唯一币种为 EUR。
- Supabase 继续作为生产数据库并保留免费层。
- 签字仅要求内部留痕。
- 不建设 GDPR/欧盟合规专项。

## 7. 系统级完成定义

- [ ] 代码通过评审并合并。
- [ ] `check:invariants`、TypeScript、Vitest 和生产构建通过。
- [ ] 资金相关改动通过真实 PostgreSQL 并发与对账测试。
- [ ] 每个任务的验收标准全部勾选。
- [ ] schema、环境示例和运行手册同步更新。
- [ ] Supabase 迁移、RLS、种子和健康检查在生产候选环境执行成功。
