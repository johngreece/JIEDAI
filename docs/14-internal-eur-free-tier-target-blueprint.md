# 借款管理系统目标蓝图（内部自用 / EUR / 免费层）— 2026-07-15

## 0. 背景与边界

- 输入：2026-05 全链路审计、当前三端代码、2026-07 最新 `main` 工作流升级。
- 使用范围：公司内部运营人员、内部客户入口、资金方入口，小规模自用。
- 固定币种：EUR，不建设多币种、汇率或换汇模块。
- 生产数据库：Supabase PostgreSQL，继续使用免费层。
- 部署目标：保持免费层可部署，避免依赖高频 Vercel Cron、付费队列和付费可观测平台。
- 签字标准：内部留痕即可，保留签名图、签署人、时间、IP、设备信息、确认项和合同内容哈希，不接第三方合格电子签。
- 非目标：GDPR 请求工作台、数据跨境合规项目、多租户 SaaS、会计总账替代、银行直连、自动扣款。

## 1. 不可变约束

1. **系统金额只使用 EUR** — 所有界面、通知、合同和导出必须从同一个币种配置读取，业务代码不得声明其他币种。
2. **一个业务状态只有一个定义和一张流转图** — 状态标签、终态、可操作条件和合法迁移必须来自同一领域模块。
3. **已确认资金记录不可直接删除或覆盖** — 错账通过冲正或更正分录处理，保留原始资金轨迹。
4. **资金变化与台账写入必须在同一数据库事务内完成** — 余额、放款、还款、资金方流水和结算不得出现半成功。
5. **所有可重放写操作必须幂等** — 放款、还款确认、结算生成、定时扫描和消息重试重复执行不得重复记账。
6. **权限以 API 边界为准** — 页面隐藏按钮只是体验优化，不能代替会话、角色和数据归属校验。
7. **合同签署只追求内部可追溯** — 当前签名留痕模型继续使用；签署后合同内容和签署证据不可静默修改。
8. **Supabase 是生产数据唯一来源** — Vercel、GitHub Actions 和本地环境都只通过受控连接访问，不建立第二套业务数据库。
9. **免费层调度按每日维护设计** — 定时任务集中为每日一次、可重复执行的维护链；紧急操作保留后台手动触发。
10. **免费层无托管备份必须由系统补位** — 至少每周生成加密数据库备份，并定期做恢复演练。

## 2. 架构原则

1. **币种配置集中在 `src/lib/system-config.ts`** — 验证：CI 扫描禁止业务代码出现 `USD`、`CNY`、`RMB` 等币种声明。
2. **状态规则集中在领域状态机** — 验证：路由不得直接写入未被状态机允许的下一状态。
3. **金额计算使用 `Decimal`，展示才转字符串** — 验证：资金服务测试覆盖小数、边界值和分配总和。
4. **资金写入采用“业务记录 + 资金流水 + 审计日志”原子提交** — 验证：故障注入测试证明任一步失败会整体回滚。
5. **定时维护每个阶段独立记录结果并继续执行** — 验证：单个阶段失败时其余阶段仍执行，最终返回失败摘要。
6. **数据库运行连接使用 Supavisor transaction pooler** — 验证：生产 `DATABASE_URL` 为 6543 端口且限制连接数。
7. **迁移连接使用 direct 或 Supavisor session pooler** — 验证：部署前迁移命令能从 CI 网络连接并完成。
8. **所有主分支变更必须通过静态检查、单测和构建** — 验证：GitHub 分支保护要求 CI 成功。
9. **免费层容量有明确红线** — 验证：数据库大小、存储、函数调用和备份结果进入月度运维检查表。

## 3. 目标模块图

| 模块 | 核心职责 | 拥有的数据 | 读取的数据 | 决策 |
|---|---|---|---|---|
| System Configuration | EUR、时区、格式和运行约束 | 代码配置 | 无 | add |
| Identity & RBAC | 三端会话、角色、权限与归属校验 | User、Role、Permission、会话 | Customer、Funder | keep |
| Customer & KYC | 客户资料和内部准入资料 | Customer、CustomerKyc | LoanApplication | keep |
| Loan Lifecycle | 申请、风控、审批及统一状态迁移 | LoanApplication、LoanApproval | Customer、Product | rebuild |
| Contract & Internal Signature | 合同生成、签字和证据快照 | Contract、Signature | LoanApplication、Customer | keep |
| Disbursement | 放款申请、支付与客户确认 | Disbursement | Contract、FundAccount | keep |
| Repayment & Overdue | 还款登记、分配、确认、逾期和展期 | Repayment、Allocation、OverdueRecord | RepaymentPlan | rebuild |
| Funder Capital | 入金、账户、收益、提现和资金方合同 | FundAccount、Journal、Settlement、Withdrawal | Disbursement、Repayment | keep |
| Finance Ledger & Reconciliation | 客户台账、资金方流水、冲正、对账 | LedgerEntry、FundAccountJournal | 全部资金事件 | rebuild |
| Notifications & Delivery | 站内通知、外部消息、失败重试 | Notification、MessageDelivery | 业务事件 | keep |
| Daily Maintenance | 每日逾期、结算、提醒和重试编排 | 运行结果日志 | 相关业务服务 | add |
| Audit & Operations | 变更审计、健康检查、备份和恢复 | AuditLog、备份产物 | 全系统 | rebuild |

### 重点调整

#### System Configuration

- **Decision**: add
- **Add**: 固定 EUR、统一金额格式、时区和系统名称。
- **Connects to**: 前端展示、通知、合同、CSV 导出、健康检查。

#### Loan Lifecycle

- **Decision**: rebuild
- **Keep**: 现有申请、风控、审批、合同、放款数据表和路由。
- **Delete**: 路由和页面中的内联状态白名单、重复状态标签。
- **Add**: 单一状态机、迁移校验和状态历史测试。
- **Connects to**: Contract、Disbursement、Repayment、Notifications。

#### Repayment & Overdue

- **Decision**: rebuild
- **Keep**: 当前还款确认、分配、逾期扫描、展期和重组能力。
- **Merge in**: 分散在路由中的可还余额和状态判断。
- **Add**: 并发确认测试、冲正入口、逾期与结清终态规则。

#### Finance Ledger & Reconciliation

- **Decision**: rebuild
- **Keep**: `LedgerEntry`、`FundAccountJournal` 和现有对账脚本。
- **Delete**: 已确认资金记录的直接修改路径。
- **Add**: 资金事件契约、冲正关联、每日差异报告和阻断级告警。

#### Daily Maintenance

- **Decision**: add
- **Add**: 每日一次编排逾期、资金方收益结算、客户/资金方提醒和消息重试；每个阶段单独返回结果。
- **Connects to**: Vercel Hobby Cron、后台手动触发、Supabase。

#### Audit & Operations

- **Decision**: rebuild
- **Keep**: 健康检查、审计日志、回归脚本和 RLS 脚本。
- **Add**: CI 门禁、加密备份、恢复演练、容量红线和生产运行手册。

## 4. 目标工作流

### 借款主链路

阶段：**客户资料完成** → **申请提交** → **风控** → **审批** → **合同签署** → **放款支付** → **客户收款确认** → **还款计划生效** → **结清/逾期处置**

| 阶段 | 负责模块 | 进入条件 | 退出条件 | 失败分支 |
|---|---|---|---|---|
| 申请 | Loan Lifecycle | 客户资料完整、无进行中借款 | SUBMITTED | 驳回后终态 REJECTED |
| 风控/审批 | Loan Lifecycle | 合法前序状态 | APPROVED | 风控或审批拒绝 |
| 签署 | Contract | 合同冻结、客户本人会话 | SIGNED/CONTRACTED | 过期或取消 |
| 放款 | Disbursement | 合同已签、资金充足 | PAID/CONFIRMED | 支付前取消 |
| 还款 | Repayment | 计划已生成 | SETTLED | OVERDUE → 展期/重组/结清 |

闭环检查：**是**；终态为 `REJECTED`、`CANCELLED` 或 `SETTLED`。

### 资金方资金链路

阶段：**资金方入金** → **账户确认** → **资金占用放款** → **收益计提** → **平台支付** → **资金方确认** → **本金/收益提现完成**

闭环检查：**是**；终态为资金流水已记账、结算 `CONFIRMED_BY_FUNDER`、提现 `PAID` 或明确拒绝。

### 内部签字链路

阶段：**合同内容冻结** → **条款确认** → **签名采集/复用** → **证据写入** → **合同状态更新**

闭环检查：**是**；签名图、签署人、时间、IP、设备、确认项、渠道和合同 SHA-256 哈希作为内部证据保存。

### 每日维护链路

阶段：**逾期扫描** → **资金方结算生成** → **客户/资金方提醒扫描** → **消息失败重试** → **结果汇总**

闭环检查：**是**；终态为所有阶段均成功，或返回包含失败阶段的可操作摘要。

## 5. 单一数据源声明

| 领域 | 单一来源 | 禁止重复声明的位置 |
|---|---|---|
| 币种与金额格式 | `src/lib/system-config.ts` | 页面、服务、通知、合同、导出 |
| 借款状态及迁移 | `src/lib/loan-lifecycle.ts` | API 路由、React 页面 |
| 通用状态展示 | `src/lib/status-ui.ts` | 页面局部 `STATUS_MAP` |
| 权限 | 数据库 Permission + `src/lib/permissions.ts` | 仅前端按钮判断 |
| 客户身份 | `customers` | 合同或申请中的重复身份主表 |
| 资金余额 | `fund_accounts` + `fund_account_journal` | 根据页面列表临时求和作为余额 |
| 客户账务 | `ledger_entries` | 放款/还款表直接充当总账 |
| 签署证据 | `signatures` | 仅合同 HTML 中的图片 |

## 6. 迁移方向

1. 建立 EUR 系统配置、每日维护编排和 CI 门禁 — depends on: nothing。
2. 恢复新的 Supabase 生产项目并执行完整 schema/seed/health check — depends on: move 1。
3. 建立借款统一状态机并迁移 API 状态写入 — depends on: move 1。
4. 为资金事件声明原子写入和冲正规则 — depends on: move 3。
5. 扩充自动对账、并发和幂等回归 — depends on: move 4。
6. 建立免费层加密备份、恢复演练和容量检查 — depends on: move 2。
7. 统一三端金额、状态、错误和操作反馈 — depends on: moves 1 and 3。
8. 以真实 Supabase 数据跑完整三端 E2E 并形成上线基线 — depends on: moves 2, 5, 6, 7。

## 7. 目标摘要

目标系统是一套小规模、内部自用、单币种 EUR 的借款运营平台。Supabase PostgreSQL 保存唯一业务事实，Vercel 只承载无状态应用和每日维护入口。借款、合同、放款、还款、逾期、资金方收益和提现形成明确终态，任何资金变化都同时留下业务记录、资金流水和审计记录。合同签字保留足够的内部证据，但不承担第三方合格电子签职责。系统不引入付费队列和多余基础设施，通过数据库事务、幂等、每日维护、GitHub CI、加密备份和全链路回归获得可控的可靠性。

## 8. 交给执行计划的内容

- 第 6 节迁移动作转换为任务。
- 所有 `add` / `rebuild` 模块转换为工作包。
- 第 1 节不可变约束转换为验收标准和 CI 检查。
- 第 5 节单一数据源转换为代码审查门禁。
