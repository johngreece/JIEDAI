# 借贷系统链路审计与智能化增强蓝图

日期：2026-05-18  
系统：DAIKUAN / Loan Management System  
目标：把客户借款、工作人员出款、资金方入资三条主链路梳理清楚，判断当前系统是否达到可用，并给出增强方向。

## 0. 结论先行

当前系统已经不是空壳。它具备三端登录、后台主菜单、客户门户、资金方门户、贷款申请、审批、合同、签署、出款、还款、逾期、展期、重组、资金方收益、提现、对账单、通知、审计、智能看板等核心模块。Prisma schema 中有 39 个业务/基础设施模型，`src/app/api` 下有 88 个 API route，服务层已经有风控智能、异常检测、资金方收益、结算、消息投递、逾期扫描等能力。

但按“生产可用的智能借贷系统”标准看，当前更准确的状态是：**主流程 MVP 已接近可跑通，但资金证据链、权限数据范围、状态单一来源、附件凭证、自动化验收和部分异常闭环还不足**。如果现在直接上线真实资金业务，会有审计风险、资金追溯风险、越权访问风险和人工兜底压力。

建议把“可用”定义为：任一笔借款能从申请、审批、合同、放款、客户确认、还款、核销、资金方收益、对账单完整反查；任一笔钱能反查来源、去向、回收、收益和操作人；任一角色只能看和操作自己权限范围内的数据。

## 1. 本次审计材料

已查看：
- 产品与流程文档：`docs/01-system-module-diagram.md`、`docs/03-flow-diagrams.md`、`docs/05-PRD-product-requirements.md`、`docs/06-API-list.md`、`docs/10-loan-fee-and-sign-rules.md`、`docs/11-gap-analysis-roadmap.md`、`docs/platform-audit-2026-03.md`
- 数据模型：`prisma/schema.prisma`
- 页面入口：`src/app/admin`、`src/app/client`、`src/app/funder`
- 后台菜单：`src/components/admin/Sidebar.tsx`
- API：`src/app/api`
- 服务层：`src/services`
- 权限与认证：`src/lib/auth.ts`、`src/lib/rbac.ts`、`src/lib/permissions.ts`、`src/middleware.ts`

验证结果：
- `npm test` 通过：1 个测试文件，5 个用例，覆盖合同变量引擎。
- `npm run health-check` 在 2 分钟内未结束。
- `npm run lint` 在 2 分钟内未结束。

盲区：
- 未连接真实生产数据核对余额、台账和历史单据。
- 未用浏览器逐页截图检查 UI 细节。
- 未验证外部短信、邮件、WhatsApp、银行流水、文件存储等真实第三方集成。

## 2. 角色与入口梳理

| 角色端 | 入口 | 已有页面/能力 | 主要增强点 |
|---|---|---|---|
| 管理后台 | `/admin/login` | 工作台、财务系统、上线检查、客户、借款申请、放款、还款、计划、逾期、结算、资金台账、资金方、资金方提现、用户、角色、产品、模板、展期、重组、审计日志。菜单证据：`src/components/admin/Sidebar.tsx:27` 到 `src/components/admin/Sidebar.tsx:63` | 细粒度权限还没有覆盖所有后台 API；财务、风控、审批、法务、催收、审计的数据范围要严格拆开 |
| 客户端 | `/client/login` | 借款首页、还款、还款计划、证件、通知、合同签署、还款签署。导航证据：`src/app/client/(main)/layout.tsx:35` 到 `src/app/client/(main)/layout.tsx:38` | 客户身份/KYC 还停留在上传材料，缺少人工/自动认证结论驱动授信和准入 |
| 资金方端 | `/funder/login` | 概览、放款、提现、消息；另有对账单、合同页面。导航证据：`src/app/funder/(main)/layout.tsx:36` 到 `src/app/funder/(main)/layout.tsx:39`，页面证据：`src/app/funder/(main)/statements/page.tsx`、`src/app/funder/(main)/contracts/page.tsx` | 对账单和合同页面存在，但主导航没有显性入口；资金方不能自助发起入资申请 |
| 系统任务 | `/api/cron/*` | 逾期扫描、通知扫描、消息重试，带 `CRON_SECRET` 校验。证据：`src/lib/cron-auth.ts` | 需要运行状态监控、失败告警和任务执行审计 |

## 3. 现有模块清单

| 模块 | 当前阶段 | 主要表/文件 | 说明 |
|---|---|---|---|
| 认证与 RBAC | 部分可用 | `User`、`Role`、`Permission`、`RolePermission`，`src/lib/auth.ts`、`src/lib/rbac.ts` | 三端 cookie/JWT 已分离；后台 RBAC 存在，但部分 API 只检查后台登录或超级管理员 |
| 客户与 KYC | 部分可用 | `Customer`、`CustomerKyc`，`src/app/api/client/documents/route.ts` | 客户可上传证件，后台可查看；缺少强 KYC 审核流、黑名单/观察名单结构字段 |
| 资金方与账户 | 部分可用 | `Funder`、`FundAccount`、`CapitalInflow`、`FundAccountJournal` | 后台可创建资金方和入金；资金方可看收益、放款、提现、对账 |
| 产品与费率规则 | 部分可用 | `LoanProduct`、`PricingRule`、`SystemSetting`，`src/lib/interest-engine.ts` | 已支持公开产品、7 天规则、逾期复利、费率设置；规则来源还分散在产品规则、系统设置和代码默认值 |
| 借款申请与审批 | 可用但不完整 | `LoanApplication`、`LoanApproval`，`src/app/api/loan-applications/*` | 有客户自助申请、风控、审批；缺少多级审批、补件、退回重提的完整状态 |
| 合同与签署 | 部分可用 | `ContractTemplate`、`Contract`、`Signature`，`src/services/contract.service.ts` | 可生成合同、填充变量、客户签署、记录 IP/设备/合同 hash；缺少 PDF 归档、多方签署和外部可信时间戳 |
| 放款 | 可用但证据不足 | `Disbursement`，`src/app/api/disbursements/*` | 合同签署后可创建放款单，确认打款后扣资金账户并生成还款计划；缺少打款凭证上传，且一笔申请只能一笔放款 |
| 还款与核销 | 部分可用 | `RepaymentPlan`、`RepaymentScheduleItem`、`Repayment`、`RepaymentAllocation`、`RepaymentConfirmation` | 支持登记、分配、客户确认、后台确认到账、更新计划和资金账户；还款凭证和精细已还字段不足 |
| 逾期 | 部分可用 | `OverdueRecord`，`src/services/overdue.service.ts` | 可扫描逾期、计算罚息、标记 resolved；缺少催收任务、承诺还款、坏账审批链 |
| 展期 | 部分可用 | `Extension`，`src/services/extension.service.ts` | 可生成新还款计划、替换旧计划、写资金账户流水；缺少补充协议签署闭环 |
| 重组 | 不完整 | `Restructure`，`src/app/api/restructures/*` | 目前主要是创建和审批状态，审批通过没有生成新计划、补充协议和旧计划替换 |
| 总账与资金流水 | 部分可用 | `LedgerEntry`、`FundAccountJournal`，`src/services/ledger.service.ts`、`src/services/fund-account-ledger.service.ts` | 客户侧总账和资金方账户流水同时存在；需要明确二者边界和对账规则 |
| 通知与消息投递 | 部分可用 | `Notification`、`MessageDelivery`、`MessageDeliveryAttempt` | 有站内信、外部投递队列、重试和监控；需要送达证明和业务触发矩阵 |
| 智能看板与风控智能 | 部分可用 | `smart-dashboard.service.ts`、`risk-intelligence.service.ts`、`anomaly-detection.service.ts` | 已有规则型评分、异常信号、资金缺口、回款预测；还不是可解释、可审批联动的智能决策系统 |
| 审计日志 | 部分可用 | `AuditLog`，`src/lib/audit.ts` | 多数关键动作会写日志；但部分审计失败被吞掉，部分核心数据仍允许物理删除 |

## 4. 客户怎么借款：当前链路与断点

### 当前链路

1. 客户登录 `/client/login`。
2. 客户在客户端首页选择公开产品并提交借款申请。接口：`POST /api/client/loan-applications`，代码会限制产品只能是 `UPFRONT_7D` 和 `FULL_AMOUNT_7D`，证据：`src/lib/public-loan-products.ts:1`，`src/app/api/client/loan-applications/route.ts:31`。
3. 客户申请创建为 `PENDING_RISK`，通知后台处理，证据：`src/app/api/client/loan-applications/route.ts:155`。
4. 风控人员审核：`POST /api/loan-applications/:id/risk`，只允许 `PENDING_RISK`，通过进入 `PENDING_APPROVAL`，拒绝进入 `REJECTED`，证据：`src/app/api/loan-applications/[id]/risk/route.ts:37` 到 `src/app/api/loan-applications/[id]/risk/route.ts:41`。
5. 审批人员审批：`POST /api/loan-applications/:id/approve`，只允许 `PENDING_APPROVAL`，通过进入 `APPROVED`，证据：`src/app/api/loan-applications/[id]/approve/route.ts:51` 到 `src/app/api/loan-applications/[id]/approve/route.ts:61`。
6. 管理端生成合同：`POST /api/contracts/generate`，服务要求申请为 `APPROVED`，证据：`src/services/contract.service.ts:156`。
7. 客户签署合同：`POST /api/contracts/:id/sign`，签署后合同 `SIGNED`，主借款申请 `CONTRACTED`，证据：`src/app/api/contracts/[id]/sign/route.ts:108` 到 `src/app/api/contracts/[id]/sign/route.ts:116`。
8. 财务创建放款单：`POST /api/disbursements`，要求申请状态 `CONTRACTED` 且主合同 `SIGNED`，证据：`src/app/api/disbursements/route.ts:120` 到 `src/app/api/disbursements/route.ts:128`。
9. 财务确认打款：`POST /api/disbursements/:id/confirm-paid`，放款单变 `PAID`，借款申请变 `DISBURSED`，资金账户扣减，生成还款计划，证据：`src/app/api/disbursements/[id]/confirm-paid/route.ts:98` 到 `src/app/api/disbursements/[id]/confirm-paid/route.ts:186`。
10. 客户确认收款：`POST /api/client/disbursements/:id/confirm-received`，放款单变 `CONFIRMED`，证据：`src/app/api/client/disbursements/[id]/confirm-received/route.ts:36` 到 `src/app/api/client/disbursements/[id]/confirm-received/route.ts:46`。
11. 客户后续还款：客户端可提交还款申请，后台分配后客户确认，后台确认到账后核销。

### 断点与增强

- **P1：还款计划生成时点与文档目标不一致。** 文档定义是客户确认收款后触发还款计划，但当前在财务确认打款后即生成计划。需要明确业务政策：如果以银行出账为起息点，这是合理的；如果以客户确认到账为起息点，需要调整。
- **P1：客户借款前的 KYC 门槛不足。** 客户可上传证件，但申请接口没有强制“证件已验证、风险等级允许、黑名单阻断”。现有客户表只有 `riskLevel`，文档中的 `risk_tags`、`is_blacklist`、`is_watchlist` 没有落表，证据：`docs/01-system-module-diagram.md:154` 到 `docs/01-system-module-diagram.md:155`，`prisma/schema.prisma:113`。
- **P1：补件/退回重提链路不足。** 文档状态机有 returned/补件，但实际审批 schema 只有 `APPROVE` 和 `REJECT`，证据：`src/app/api/loan-applications/[id]/approve/route.ts:11`。
- **P2：合同签署证据还不够强。** 当前有手写签名、IP、设备、合同 hash，但没有 PDF 归档、可信时间戳、短信 OTP/WebAuthn 二次确认、签署挑战码结果。
- **P2：客户只能看“最近一笔在途借款”。** 客户首页用 `findFirst` 取最近未完成申请，历史列表和多笔历史追踪需要加强，证据：`src/app/client/(main)/dashboard/page.tsx:93`。

## 5. 工作人员怎么出款：当前链路与断点

### 当前链路

1. 申请必须先到 `APPROVED`，合同生成并签署后进入 `CONTRACTED`。
2. 财务进入后台放款页面，选择已审批/已签约申请和资金账户，创建放款单。页面证据：`src/components/admin/pages/DisbursementsPageClient.tsx:73` 到 `src/components/admin/pages/DisbursementsPageClient.tsx:74`。
3. 创建放款单时系统计算 `netAmount = amount - feeAmount`，并校验资金账户可用余额，扣除同账户 `PENDING` 放款占用，证据：`src/app/api/disbursements/route.ts:104`，`src/app/api/disbursements/route.ts:178` 到 `src/app/api/disbursements/route.ts:188`。
4. 放款单创建为 `PENDING`，实际扣账在确认打款时发生，证据：`src/app/api/disbursements/route.ts:194` 到 `src/app/api/disbursements/route.ts:204`。
5. 财务确认打款后，系统写业务总账、写资金方账户流水、扣减资金账户余额、增加 `totalOutflow`，并生成还款计划，证据：`src/app/api/disbursements/[id]/confirm-paid/route.ts:158` 到 `src/app/api/disbursements/[id]/confirm-paid/route.ts:186`。
6. 客户端显示“确认收款”按钮，由客户确认放款到账，证据：`src/app/client/(main)/dashboard/page.tsx:342`。

### 断点与增强

- **P1：不支持分笔放款。** 文档写明支持分笔放款，但 schema 中 `Disbursement.applicationId` 是 `@unique`，且创建接口会阻止同申请重复创建放款单，证据：`prisma/schema.prisma:544`，`src/app/api/disbursements/route.ts:137` 到 `src/app/api/disbursements/route.ts:142`。
- **P1：缺少打款凭证字段和上传流程。** 文档中有 `proof_url`，实际 `Disbursement` 模型没有 proof 字段，前端和 API 也没有凭证上传，证据：`docs/01-system-module-diagram.md:210`，`prisma/schema.prisma:541` 到 `prisma/schema.prisma:557`。
- **P1：核心待放款单可以物理删除。** `DELETE /api/disbursements/:id` 会直接 `tx.disbursement.delete`，这和“核心业务禁止物理删除”原则冲突，证据：`src/app/api/disbursements/[id]/route.ts:145`。
- **P2：出款操作缺少复核/四眼原则。** 当前 `disbursement:confirm` 一人即可确认打款，真实资金业务建议增加“创建人”和“复核确认人”不可相同。
- **P2：付款账户字段没有在创建流程显式采集。** 模型有 `payerAccount`、`payerBank`，但创建页面主要选择资金账户，没有上传银行流水、收款账号二次确认、出账渠道回执。

## 6. 资金方如何入资：当前链路与断点

### 当前链路

1. 后台创建资金方和资金账户。模型：`Funder`、`FundAccount`，证据：`prisma/schema.prisma:160`，`prisma/schema.prisma:194`。
2. 后台对资金账户登记入金：`POST /api/fund-accounts/:id/inflows`，仅超级管理员可操作，入金直接 `CONFIRMED`，证据：`src/app/api/fund-accounts/[id]/inflows/route.ts:18` 到 `src/app/api/fund-accounts/[id]/inflows/route.ts:19`，`src/app/api/fund-accounts/[id]/inflows/route.ts:65` 到 `src/app/api/fund-accounts/[id]/inflows/route.ts:71`。
3. 入金后写资金方账户流水，更新 `balance` 和 `totalInflow`，证据：`src/app/api/fund-accounts/[id]/inflows/route.ts:78` 到 `src/app/api/fund-accounts/[id]/inflows/route.ts:96`。
4. 财务出款时选择资金账户，放款确认后资金账户扣款并生成流水。
5. 资金方登录后可看总投入、在贷资金、累计收益、可提现、本金/利息、7/30 天预测、放款列表，证据：`src/app/funder/(main)/dashboard/page.tsx:166` 到 `src/app/funder/(main)/dashboard/page.tsx:180`。
6. 资金方可发起提现，后台审批通过后扣减资金账户并写资金方流水，证据：`src/services/funder-interest.service.ts:493` 到 `src/services/funder-interest.service.ts:544`。
7. 资金方可查看或导出对账单 CSV，证据：`src/app/api/funder/statements/route.ts:41` 到 `src/app/api/funder/statements/route.ts:53`。

### 断点与增强

- **P1：资金方不能自助发起入资申请。** 当前入金由后台超级管理员直接登记，资金方端没有“我要入资/上传转账凭证/等待财务确认”的闭环。
- **P1：入金没有凭证字段、没有审核状态。** `CapitalInflow` 只有 amount、channel、inflowDate、status、remark，没有 proofUrl、operatorId、confirmedBy、confirmedAt，证据：`prisma/schema.prisma:217` 到 `prisma/schema.prisma:225`。
- **P1：入金可物理删除。** 删除入金会 `capitalInflow.delete` 并扣回余额，证据：`src/app/api/fund-accounts/[id]/inflows/[inflowId]/route.ts:68`。真实资金系统应走冲正/作废。
- **P1：资金来源没有细到“哪笔入金支持哪笔放款”。** 文档提到 `capital_inflow_id` 可关联具体入金，但实际 `Disbursement` 没有 `capitalInflowId` 字段，只有 `fundAccountId`。
- **P2：资金方合同和对账单页面存在但导航不完整。** 页面已存在，但资金方主 layout 底部导航只有概览、放款、提现、消息。

## 7. 上下游关系总图

```text
客户 Customer
  -> KYC/证件 CustomerKyc
  -> 借款申请 LoanApplication
  -> 风控/审批 LoanApproval
  -> 合同 Contract + 签名 Signature
  -> 放款 Disbursement
  -> 资金账户 FundAccount + 资金账户流水 FundAccountJournal
  -> 还款计划 RepaymentPlan
  -> 还款期次 RepaymentScheduleItem
  -> 还款单 Repayment
  -> 还款分配 RepaymentAllocation
  -> 客户还款确认 RepaymentConfirmation
  -> 业务总账 LedgerEntry
  -> 逾期 OverdueRecord / 展期 Extension / 重组 Restructure
  -> 资金方收益 FundProfitShare
  -> 资金方提现 FunderWithdrawal
  -> 资金方对账 FunderStatement
```

关键上游：
- 客户资料、KYC、授信额度决定是否可申请。
- 产品与费率规则决定合同金额、到账金额、应还金额、逾期金额。
- 资金方账户余额决定是否可出款。
- 合同签署状态决定是否可创建放款单。

关键下游：
- 放款决定还款计划和起息点。
- 还款确认决定计划核销、资金账户回款、收益。
- 逾期决定罚息、催收、展期或重组。
- 资金方收益和提现依赖放款、回款、账户流水和合作模式。

## 8. 七角色审计发现

### 8.1 Product / 产品

- **P1：主链路接近可跑通，但异常分支不完整。** 申请、风控、审批、合同、放款、还款都有入口；补件、退回、放款失败、客户未确认、对账差异、坏账核销还没有完整终态。
- **P1：分笔放款与实际模型冲突。** 文档有分笔放款，实际一申请一放款。
- **P1：重组不是闭环。** 重组审批只改状态，没有新计划、补充协议、旧计划 supersede。
- **P2：资金方入资是后台登记，不是资金方流程。** 对资金方来说，入资、凭证、确认、可用余额之间缺少可见链路。

### 8.2 UX / 操作体验

- **P2：后台菜单完整，但角色工作台不够任务化。** 风控人员、审批经理、财务、催收应看到“我今天要处理什么”，而不是只靠列表筛选。
- **P2：资金方导航不完整。** 对账单和合同页面存在，但主导航不突出。
- **P2：关键动作大量使用 alert。** 例如放款、还款、审批页面多处用 `alert`，需要替换为可追踪的结果提示、失败原因和下一步动作。
- **P3：状态术语需要统一展示。** 代码中有 `DISBURSED`、`SETTLED`、`CONTRACTED`，部分页面/文档还出现 `PENDING_DISBURSEMENT`、`CONTRACT_SIGNED`，容易让运营误判。

### 8.3 System Architect / 架构

- **P1：状态没有单一来源。** schema 中大量状态是 `String`，没有 enum；状态值散落在 API、页面、服务和文档中，证据：`prisma/schema.prisma:416`、`prisma/schema.prisma:553`、`prisma/schema.prisma:632`。
- **P1：附件/证据体系没有统一。** schema 有 `Attachment`，但 KYC 直接把 base64 data URL 存进 `CustomerKyc.documentUrl`，证据：`src/app/api/client/documents/route.ts:94` 到 `src/app/api/client/documents/route.ts:110`。
- **P1：权限模型缺少数据范围 scope。** RBAC 能判断权限码，但没有“资金方只能看己方、客户只能看自己的所有 API”这种统一策略。
- **P2：总账和资金账户流水双轨存在，需要定义边界。** `LedgerEntry` 和 `FundAccountJournal` 都记录钱，必须明确一个是业务总账、一个是资金方账户流水，并建立对账规则。

### 8.4 Tech Lead / 工程

- **P1：自动化测试覆盖不足。** 当前 `npm test` 只覆盖合同变量引擎 5 个用例，主业务链路没有自动化回归。
- **P1：`lint` 和 `health-check` 超时。** 可用系统必须让构建、lint、健康检查稳定输出。
- **P1：核心资金动作幂等覆盖不足。** 已有 `IdempotencyKey`，但主要看到放款创建使用；入金、确认打款、确认还款、提现审批等都应覆盖。
- **P2：审计失败被吞掉。** 多处 `writeAuditLog(...).catch(() => undefined)`，真实审计系统不应静默失败。

### 8.5 DBA / 数据库

- **P1：状态字段缺少 enum 或约束。** 这会导致错拼状态进入数据库，破坏看板和流程判断。
- **P1：资金证据字段不足。** 入金、出款、还款都缺少统一凭证、银行流水号、外部交易 ID、确认人、确认时间。
- **P1：分笔放款不被 schema 支持。** `applicationId @unique` 阻断多放款。
- **P2：还款期次缺少本金/利息/费用/罚息的已还累计字段。** 目前主要靠 `remaining` 和 allocation 推导，报表与审计解释会更难。
- **P2：泛型附件表没有强关系。** `Attachment` 用 `entityType/entityId` 字符串，灵活但缺少 FK 约束。

### 8.6 QA / Internal Auditor

- **P1：存在越权读取风险。** `GET /api/repayments/:id` 使用 `getSession()`，未看到客户归属或后台权限检查，任何登录态只要知道 ID 就可能读取还款记录概要，证据：`src/app/api/repayments/[id]/route.ts:9` 到 `src/app/api/repayments/[id]/route.ts:37`。
- **P1：物理删除仍存在。** 待放款单、未确认还款、无流水资金账户、入金记录都有直接 delete 路径。
- **P1：资金链路缺少外部凭证校验。** 没有银行流水号、凭证附件、复核人，审计只能相信系统录入。
- **P2：定时任务需要可观测。** Cron 已有鉴权，但需要执行日志、失败重试、告警。

### 8.7 Finance / Operations

- **P1：每一分钱可追溯到资金账户，但未追溯到具体入金批次。** 当前放款关联 `fundAccountId`，没有 `capitalInflowId` 或资金分摊表。
- **P1：资金方入金和提现没有完整财务审批流。** 入金后台直接确认，提现有申请/审批但还需要出账凭证和对账状态。
- **P1：还款核销后资金账户增加整笔还款，同时 `totalProfit` 增加利息/费用/罚息。** 这套口径要在财务说明中固定，否则资金方会问“余额、利润、可提本金、可提利息”之间如何对上。
- **P2：结算中心存在，但需要和资金方对账单、提现、收益分润建立一张可审计的闭环表。**

## 9. 跨角色优先级问题

| 优先级 | 问题 | 影响角色 |
|---|---|---|
| P0 | 主链路缺少端到端自动化验收，无法证明真实可用 | 全部 |
| P1 | 权限数据范围不完整，客户/资金方/后台跨数据访问风险 | 客户、资金方、审计、工程 |
| P1 | 状态值没有单一来源，文档、页面、API、服务存在漂移 | 产品、工程、QA、运营 |
| P1 | 资金证据链不足，入金/出款/还款缺少统一凭证和外部交易 ID | 财务、审计、资金方 |
| P1 | 物理删除核心记录，破坏审计链 | 财务、审计、DBA |
| P1 | 分笔放款、具体入金批次追溯不支持 | 产品、财务、资金方 |
| P1 | 重组、补件、放款失败、对账差异等异常链路不闭合 | 产品、运营、QA |

## 10. 目标系统不变量

1. **所有资金动作 append-only。** 入金、出款、还款、提现、结算只能新增、确认、冲正、作废，不能物理删除。
2. **状态只有一个来源。** 每个领域的状态枚举集中定义，API、前端、schema、测试都引用它。
3. **权限在 API 边界强制执行。** UI 只能做展示控制，不能作为唯一权限保护。
4. **数据范围必须随角色生效。** 客户只看自己，资金方只看己方，员工按角色和组织范围看。
5. **每笔钱可追溯来源和去向。** 入金批次、资金账户、放款、回款、收益、提现必须能串起来。
6. **每份合同和计划都有快照。** 合同内容、费率规则、还款计划、签署证据不可被后续配置覆盖。
7. **每个流程有终态。** 完成、拒绝、取消、作废、冲正、坏账、重组完成必须明确。
8. **智能建议必须可解释。** 风控、分配、催收、资金匹配、提现建议都要显示命中原因和人工覆核结果。

## 11. 目标模块地图

| 模块 | 目标责任 | 拥有数据 | 读取数据 | 决策 |
|---|---|---|---|---|
| Identity & RBAC | 登录、权限码、数据范围、会话安全 | User、Role、Permission、Scope | 全模块最小信息 | 保留并增强 |
| Customer & KYC | 客户身份、证件、授信、黑名单 | Customer、CustomerKyc、RiskTag | Loan、Repayment、Overdue | 拆出 KYC 审核流 |
| Product & Fee Rules | 产品、利率、费用、逾期、展期规则 | LoanProduct、PricingRule、SystemSetting | Contract、Disbursement、Repayment | 合并规则来源 |
| Loan Workflow | 申请、风控、审批、补件、退回 | LoanApplication、LoanApproval | Customer、Product、Risk | 增强状态机 |
| Contract & Signing | 模板、合同、签名、证据、PDF | ContractTemplate、Contract、Signature、Attachment | Loan、Customer、Rules | 增强证据链 |
| Funding | 资金方、账户、入金、资金批次 | Funder、FundAccount、CapitalInflow、FundBatch | Disbursement、Repayment | 增加入资申请 |
| Disbursement | 放款单、复核、凭证、客户确认 | Disbursement、DisbursementProof | Loan、Contract、Funding | 支持分笔和复核 |
| Repayment | 登记、分配、客户确认、到账确认 | Repayment、Allocation、Confirmation | Plan、Overdue、Funding | 增强凭证和自动分配 |
| Plan & Schedule | 计划版本、期次、剩余、核销 | RepaymentPlan、ScheduleItem | Rules、Disbursement | 增加已还拆分字段 |
| Overdue / Extension / Restructure | 逾期、催收、展期、重组、坏账 | OverdueRecord、Extension、Restructure、CollectionTask | Plan、Contract | 重组重建为闭环 |
| Ledger & Settlement | 总账、对账、收益、结算、冲正 | LedgerEntry、FundAccountJournal、FundProfitShare | 全资金动作 | 定义双账边界 |
| Notification & Delivery | 站内信、短信/邮件/WhatsApp、回执 | Notification、MessageDelivery | 全业务事件 | 增加送达证明 |
| Smart Operations | 风控建议、资金匹配、回款预测、异常检测 | RiskSignal、DecisionLog | 全业务数据 | 从看板升级为决策辅助 |
| Audit & Evidence | 审计日志、附件、证据包、导出 | AuditLog、Attachment、EvidenceBundle | 全模块 | 强制不可静默失败 |

## 12. 目标闭环流程

### 12.1 客户借款闭环

| 阶段 | 所属模块 | 进入条件 | 退出条件 | 失败分支 |
|---|---|---|---|---|
| 注册/登录 | Identity | 客户有手机号和密码 | 客户 session 有效 | 登录失败、限流 |
| KYC/授信 | Customer & KYC | 上传证件 | KYC 通过、授信额度生效 | 补件、拒绝、黑名单 |
| 提交申请 | Loan Workflow | 产品可用、额度足够 | `PENDING_RISK` | 超额度、已有在途借款 |
| 风控审核 | Loan Workflow + Smart | 申请待风控 | `PENDING_APPROVAL` | 拒绝、补件、人工复核 |
| 审批 | Loan Workflow | 风控通过 | `APPROVED` | 拒绝、退回 |
| 合同生成 | Contract | 审批通过 | 合同 `DRAFT/PENDING_SIGN` | 模板缺失、变量缺失 |
| 客户签署 | Contract | 合同待签 | 合同 `SIGNED`，申请 `CONTRACTED` | 拒签、超时、签署失败 |
| 财务出款 | Disbursement | 已签合同、资金足够 | 放款 `PAID` | 余额不足、复核驳回 |
| 客户确认收款 | Disbursement | 银行已出账 | 放款 `CONFIRMED` | 未到账、争议、人工处理 |
| 还款计划 | Plan | 起息点明确 | 计划 `ACTIVE` | 计划生成失败 |
| 还款核销 | Repayment | 客户或财务登记还款 | 申请 `SETTLED/COMPLETED` | 客户驳回、坏账、重组 |

闭环检查：需要把“客户确认收款”和“还款计划起息点”政策固定。

### 12.2 工作人员出款闭环

| 阶段 | 所属模块 | 进入条件 | 退出条件 | 失败分支 |
|---|---|---|---|---|
| 选择待放款 | Disbursement | 申请 `CONTRACTED` | 创建放款草稿 | 合同未签 |
| 选择资金来源 | Funding | 账户可用余额足够 | 锁定/占用金额 | 余额不足 |
| 上传凭证并提交 | Disbursement | 银行打款完成 | 待复核 | 凭证缺失 |
| 复核确认 | Disbursement | 出款人与复核人不同 | `PAID`，资金账户扣款 | 驳回、冲正 |
| 客户确认 | Client | 客户收到款 | `CONFIRMED` | 争议、人工跟进 |
| 生成计划 | Plan | 起息点确认 | 计划 `ACTIVE` | 计划失败、回滚 |

闭环检查：当前缺凭证、复核、分笔和冲正。

### 12.3 资金方入资闭环

| 阶段 | 所属模块 | 进入条件 | 退出条件 | 失败分支 |
|---|---|---|---|---|
| 资金方发起入资 | Funding | 资金方登录 | 入资申请 `PENDING` | 信息不完整 |
| 上传转账凭证 | Evidence | 有银行转账 | 凭证已归档 | 文件失败 |
| 财务确认到账 | Funding | 银行流水匹配 | `CONFIRMED`，账户余额增加 | 金额不符、退回 |
| 资金进入可用池 | Funding | 入金确认 | 可用于放款 | 冻结、风控 |
| 放款占用/出账 | Disbursement | 选择资金批次或账户 | 资金去向可追溯 | 余额不足 |
| 回款收益 | Repayment + Settlement | 客户确认到账 | 本金/收益入账 | 逾期、坏账 |
| 对账/提现 | Settlement | 收益可提或本金闲置 | 提现完成、对账单可导出 | 审批拒绝、冷却期 |

闭环检查：当前是后台直接入金，需补资金方自助申请和凭证审核。

## 13. 智能化增强方向

### P0：先让系统“可靠可用”

1. 权限与数据范围：修复所有客户/资金方对象级越权风险，统一 `requireClientOwner`、`requireFunderOwner`、`requirePermissionScope`。
2. 状态单一来源：定义 `loanStatus`、`disbursementStatus`、`repaymentStatus`、`inflowStatus`、`withdrawalStatus`，前后端和测试共用。
3. 资金证据链：入金、出款、还款、提现都要有凭证、外部交易号、确认人、确认时间。
4. 禁止核心物理删除：改为取消、作废、冲正、撤销，并保留原始记录。
5. 端到端回归：至少覆盖客户申请到还款结清、资金方入金到对账提现、逾期到展期/重组。
6. 健康检查和 lint 必须稳定完成。

### P1：智能辅助运营

1. 智能风控：基于 KYC 完整度、历史逾期、重复申请、设备/IP、资料修改频率给出风险分和原因。
2. 智能审批助手：给审批人显示建议额度、建议期限、拒绝原因模板、需要补件项。
3. 智能资金匹配：出款时推荐资金账户或入金批次，考虑余额、资金成本、资金方优先级、风险共担。
4. 智能还款分配：客户提交还款后，系统按最早到期、罚息优先、费用规则自动建议 allocation，财务复核确认。
5. 智能催收：按逾期天数、客户风险、历史响应、资金方风险共担生成催收策略和提醒频率。
6. 智能对账：自动发现“业务单据金额、资金账户流水、总账、资金方对账单”不一致。

### P2：企业化能力

1. 异步导出中心：大报表不阻塞主流程。
2. 外部触达闭环：短信/邮件/WhatsApp 的送达、失败、重试、退订、模板版本。
3. 证据包导出：一笔借款可导出完整 PDF 证据包，包括申请、审批、合同、签名、放款、确认、还款、对账。
4. 经营分析：资金利用率、产品毛利、逾期迁徙率、资金方收益率、回款预测偏差。

## 14. 可用性验收清单

上线前至少要让以下用例全通过：

1. 客户上传证件、通过 KYC、获得额度。
2. 客户提交 7 天砍头息借款申请。
3. 风控审核通过，审批经理审批通过。
4. 管理端生成合同，客户手机端签署，合同内容 hash 和签署证据可查。
5. 资金方入金确认，资金账户余额增加，对账单可见。
6. 财务创建放款单，上传打款凭证，复核确认，资金账户余额减少。
7. 客户确认收款，起息点和还款计划生成规则明确。
8. 客户发起还款，后台自动建议分配，客户确认，后台确认到账。
9. 还款后计划项、业务总账、资金账户流水、资金方收益全部对平。
10. 到期未还自动逾期，罚息计算、通知、催收任务出现。
11. 展期审批通过后生成新计划和补充协议，旧计划保留。
12. 重组审批通过后生成新计划和补充协议，旧计划 superseded。
13. 资金方发起提现，后台审批，出账凭证归档，资金方对账单更新。
14. 客户不能读取其他客户还款/合同/放款。
15. 资金方不能读取其他资金方账户、放款、对账单。
16. 非财务角色不能确认打款或确认到账。
17. 任意核心记录不能物理删除，只能作废/冲正并留痕。
18. `npm test`、`npm run lint`、`npm run health-check`、主链路回归脚本稳定通过。

## 15. 下一步建议

第一批改造不要先做“更炫的智能看板”，应先补可用性底座：

1. 修复对象级权限与数据范围，优先客户还款详情、资金方对账、后台资金接口。
2. 把状态枚举集中化，清理文档和代码中漂移的状态名。
3. 建立资金证据模型：`PaymentProof` / `Attachment` 强化，覆盖入金、出款、还款、提现。
4. 把物理删除改成作废/冲正。
5. 补端到端主链路测试和财务对账测试。
6. 明确起息点：财务打款时间还是客户确认收款时间。
7. 重建重组闭环：审批通过后生成新计划、补充协议、客户签署、旧计划 superseded。
8. 再把智能风控、智能资金匹配、智能还款分配接到人工复核工作台。

## 16. 需要业务方确认的问题

1. 起息点到底是“财务确认打款时间”还是“客户确认收款时间”？
2. 是否必须支持一笔借款多次放款？
3. 资金方入资是否需要资金方自助提交，还是永远由后台财务登记？
4. 资金方收益口径是固定月息/周息，还是按客户实际利息和费用分润？
5. 客户 KYC 最低要求是什么：只上传即可，还是必须人工审核通过？
6. 放款和提现是否需要双人复核？
7. 合同是否需要具备更强合规电子签能力，例如短信 OTP、WebAuthn、生物识别或第三方电子签？
8. 坏账核销、展期、重组的审批层级分别是谁？
9. 资金方是否需要看到每笔资金对应的具体借款客户，还是只看汇总和匿名明细？
10. 实际文件存储要用 Supabase Storage、S3，还是继续临时存数据库 data URL？
