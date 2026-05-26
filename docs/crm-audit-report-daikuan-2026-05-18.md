# CRM Audit Report - DAIKUAN 借贷系统 - 2026-05-18

## 封装判定

**结论：不通过，不建议封装/发布。**

原因不是单纯页面或编译问题，而是系统闭环层面仍有阻断项：健康检查失败、财务对账失败、关键资金链路存在数据不一致，且权限、凭证、审计留痕、状态机和重组闭环还有缺口。

技术构建结果：`npm run build` 在单独重跑后通过，`npm run lint` 通过，`npm test` 通过。

业务可用结果：`npm run health-check` 失败，`npm run test:finance-reconciliation` 失败。因此当前只能认为“可编译”，不能认为“可上线可用”。

## 0. Intake Summary

### 审计输入

- 代码库：`f:\DAIKUAN`
- 数据模型：`prisma/schema.prisma`
- API 路由：`src/app/api`，当前约 88 个 API 文件
- 数据模型数量：`prisma/schema.prisma` 中约 39 个 model
- 三个主要登录/使用入口：
  - 后台工作人员：`/admin/login`
  - 客户端：`/client/login`
  - 资金方端：`/funder/login`
- 已有系统文档：
  - `docs/01-system-module-diagram.md`
  - `docs/02-database-er-design.md`
  - `docs/03-flow-diagrams.md`
  - `docs/04-backend-menu-structure.md`
  - `docs/05-PRD-product-requirements.md`
  - `docs/06-API-list.md`
  - `docs/08-test-cases.md`
  - `docs/11-gap-analysis-roadmap.md`
  - `docs/lending-system-chain-audit-2026-05-18.md`

### 已执行验证

| 验证项 | 命令 | 结果 | 审计含义 |
| --- | --- | --- | --- |
| 构建 | `npm run build` | 通过 | Next.js/Prisma 构建可完成，但首次并发执行时出现 Prisma Windows 文件锁，需要串行重跑 |
| Lint | `npm run lint` | 通过 | 静态 lint 暂无阻断；同时提示 `next lint` 未来废弃 |
| 单元测试 | `npm test` | 通过 | 目前只有 1 个测试文件、5 个测试用例，覆盖面不足 |
| 健康检查 | `npm run health-check` | 失败 | 缺少 `rate_limit_buckets`、`idempotency_keys` 两张表 |
| 财务对账 | `npm run test:finance-reconciliation` | 失败 | 已有放款数据缺 ledger 记账，净现金流不一致 |

### 审计限制

- 未执行 `npm run db:push`，因为这会直接变更当前数据库结构，需要先确认当前连接的是开发库、测试库还是生产库。
- 未执行 `npm run test:regression`、`npm run test:launch-readiness`、`npm run test:external-touchpoints`，因为这些脚本会创建或修改业务数据；在健康检查失败和对账失败前提下继续跑，容易污染当前库。
- 本次以代码、模型、脚本和命令验证为主，没有做浏览器逐页截图验收。

## 1. Module Inventory

| 区域 | 已存在模块 | 审计判断 |
| --- | --- | --- |
| 后台工作台 | `/admin/dashboard`，侧边栏入口见 `src/components/admin/Sidebar.tsx:29` | 有后台总入口 |
| 客户管理 | `/admin/customers`，KYC 文档、客户资料、风险等级 | 有客户资料链路，但 KYC 与借款准入没有强闭环 |
| 借款申请 | `/admin/loan-applications`，客户申请 API，审批 API | 有申请和审批链路，但审批动作较粗，缺补件/复核/多级审批 |
| 合同 | 合同模板、合同实例、客户签署 | 有签署状态，但缺正式归档 PDF、可信时间戳、多方签署闭环 |
| 放款 | `/admin/disbursements`，确认出款、客户确认收款 | 有操作链路，但现有数据对账失败，凭证字段不足 |
| 还款 | `/admin/repayments`，客户还款、后台确认、分摊、ledger | 架构接近闭环，但需要对账证明和权限修补 |
| 还款计划 | `/admin/repayment-plans`，生成 schedule item | 有计划与期次，但展期/重组后的计划替换不完全一致 |
| 逾期 | `/admin/overdue` | 有逾期模型和入口，需要验证自动入逾与催收动作闭环 |
| 结算 | `/admin/settlement` | 有入口，需要和 ledger、fund account、repayment reconciliation 做强一致 |
| 资金台账 | `/admin/ledger`，`LedgerEntry` model | 有台账模型，但当前数据库中已有放款缺台账记录 |
| 资金方 | `/admin/funders`，资金方端 `/funder/*` | 有资金方端，但资金方自助入资链路不完整 |
| 资金账户 | `FundAccount`、`CapitalInflow`、资金流水 | 有后台入资，但入资凭证、确认人、确认时间不完整 |
| 资金方提现 | `/admin/funder-withdrawals`、`/funder/withdrawals` | 有提现模型和入口，需要验证审批、出款、ledger 对账 |
| 用户和角色 | `/admin/users`、`/admin/roles` | 有 RBAC 基础，但部分接口只校验登录/超管，没有统一权限点 |
| 产品配置 | `/admin/products` | 有产品和定价规则，但公开产品白名单与后台配置存在双轨 |
| 模板中心 | `/admin/templates` | 有模板体系 |
| 展期管理 | `/admin/extensions` | 展期能生成新计划并废弃旧计划，但缺补充合同/签署闭环 |
| 重组管理 | `/admin/restructures` | 目前审批后只改状态，未生成新计划/合同/旧计划替换 |
| 审计日志 | `/admin/audit-logs`，`AuditLog` model | 有审计模型，但部分业务仍有物理删除和错误吞掉风险 |
| 客户端 | dashboard、documents、repayments、repayment-plans、notifications、sign | 客户端主流程存在；移动底部导航未暴露 documents/sign 独立入口 |
| 资金方端 | dashboard、disbursements、withdrawals、notifications，另有 statements/contracts 页面 | 资金方 statements/contracts 页面存在，但主导航没有暴露 |

## 2. Findings By Role

### Product Manager

1. **客户借款链路没有完全闭环。**
   客户可以提交借款申请，API 会直接创建 `PENDING_RISK` 状态，见 `src/app/api/client/loan-applications/route.ts:155`。但系统没有看到明确的 KYC 已认证、黑名单、在贷余额、历史逾期等强准入门槛。

2. **审批动作过粗。**
   审批接口只支持 `APPROVE` 和 `REJECT`，见 `src/app/api/loan-applications/[id]/approve/route.ts:12`。实际借贷业务通常需要补件、退回、复核、终审、额度调整、风控拒绝、人工复议等状态。

3. **放款策略与模型冲突。**
   数据模型强制一笔申请只能有一笔放款，`applicationId` 是唯一键，见 `prisma/schema.prisma:544`。如果业务需要分批放款、多资金方拼单、部分放款或重试出款，当前模型不支持。

4. **资金方入资链路偏后台代录。**
   有 `CapitalInflow`，但缺少资金方自助提交入资、上传凭证、后台确认、账户余额入账、资金归属可追踪的完整产品链路。

5. **重组业务未闭环。**
   重组审批只更新 `APPROVED/REJECTED`，见 `src/app/api/restructures/[id]/approve/route.ts:35`。审批通过后没有生成新还款计划、补充合同、旧计划废弃、通知客户确认等动作。

### UX Designer

1. **多角色入口存在，但角色任务路径不够显性。**
   后台菜单较完整，见 `src/components/admin/Sidebar.tsx:29-63`。但客户和资金方端主导航较少，部分已有页面没有在主导航暴露。

2. **客户关键动作入口不够闭合。**
   客户端存在 `documents` 和 `sign` 页面，但底部导航主要是借款、还款、计划、消息。对于“上传资料 - 签合同 - 确认收款 - 还款确认”这种强流程系统，关键动作需要在客户首页形成任务队列。

3. **资金方视角缺少资金闭环仪表。**
   资金方端已有 disbursements、withdrawals、statements、contracts 页面，但移动导航只有概览、放款、提现、消息，见 `src/app/funder/(main)/layout.tsx:35-39`。资金方最关心的入资、已出资、在贷余额、待回款、可提现、收益明细应该一屏可见。

4. **后台操作缺少强状态提示。**
   对于放款、确认到账、删除、审批等动作，应有更强的不可逆提示、凭证展示、前后余额展示和风控提示。

### Architect

1. **状态机没有集中单一真相。**
   多个核心模型使用 `String` 状态：借款申请见 `prisma/schema.prisma:416`，放款见 `prisma/schema.prisma:553`，还款见 `prisma/schema.prisma:632`。字符串状态分散在 API、服务和页面里，长期会产生非法状态和状态漂移。

2. **资金链路不是 append-only。**
   关键业务存在物理删除：放款删除见 `src/app/api/disbursements/[id]/route.ts:146`，还款删除见 `src/app/api/repayments/[id]/route.ts:82-87`，入资删除见 `src/app/api/fund-accounts/[id]/inflows/[inflowId]/route.ts:68`。资金系统应该优先用冲正、作废、反向流水，而不是删除。

3. **凭证模型不足。**
   `Disbursement` 模型包含金额、手续费、状态、操作人等字段，但没有出款凭证、银行流水号、渠道交易号等字段，见 `prisma/schema.prisma:541-557`。`CapitalInflow` 也缺入资凭证、确认人、确认时间等字段，见 `prisma/schema.prisma:217-225`。

4. **幂等和限流代码存在，但数据库未落地。**
   schema 中有 `rate_limit_buckets` 和 `idempotency_keys` 映射，见 `prisma/schema.prisma:956`、`prisma/schema.prisma:966`，但健康检查显示数据库缺表。

5. **出款和客户确认收款的业务边界需要确认。**
   后台确认出款时已经把放款置为 `PAID`、申请置为 `DISBURSED`，并生成还款计划和 ledger，见 `src/app/api/disbursements/[id]/confirm-paid/route.ts:101-165`。客户确认收款只把放款改为 `CONFIRMED`，见 `src/app/api/client/disbursements/[id]/confirm-received/route.ts:36-57`。如果业务定义为“客户确认收款后起息”，当前实现不符合；如果定义为“财务出款后起息”，则需要在文档和页面明确。

### Tech Lead

1. **构建可通过，但并发构建/Prisma generate 有 Windows 文件锁风险。**
   `npm run build` 单独重跑通过；首次并发执行时 Prisma query engine rename 出现 `EPERM`。这不是业务阻断，但会影响本机或 CI 上的稳定性。

2. **测试覆盖不足以证明系统可用。**
   `npm test` 只跑到 1 个测试文件、5 个测试。对于借贷系统，至少应覆盖申请、审批、签署、出款、客户确认、还款、展期、重组、提现、权限、幂等、对账。

3. **部分接口权限校验不够集中。**
   多个管理接口直接使用 `getAdminSession()` 或超管判断，而不是统一权限点。例如产品、资金账户、展期相关接口可见 `src/app/api/products/route.ts:25`、`src/app/api/fund-accounts/route.ts:8-12`、`src/app/api/extensions/route.ts:16`。

4. **对象级访问控制存在缺口。**
   `GET /api/repayments/:id` 只校验已登录 session，然后按 id 查询还款详情，见 `src/app/api/repayments/[id]/route.ts:13-37`。如果普通客户能命中该 API，可能通过枚举 id 查看他人还款数据。

5. **文档上传以 base64 data URL 存数据库。**
   客户文档上传把文件转 base64 后写入 `documentUrl`，见 `src/app/api/client/documents/route.ts:94-110` 和 `src/app/api/customers/[id]/documents/route.ts:99-114`。这会放大数据库体积，增加备份、权限和泄露风险。

### DBA

1. **当前数据库 schema 与代码不一致。**
   健康检查失败，缺 `rate_limit_buckets`、`idempotency_keys`。这些表是限流和幂等的基础设施，缺失会让部分请求在运行时失败或绕过保护。

2. **财务对账失败说明已有数据不一致。**
   财务对账脚本发现已有两笔放款没有 `DISBURSEMENT/CREDIT` ledger，没有 `FEE/DEBIT` ledger，并且 `summary.periodNetCashflow expected -19000.00, got 81000.00`。

3. **关键金额字段需要统一精度和对账策略。**
   schema 中金额多为 Decimal，这一点是正确方向。但需要所有资金动作都落 ledger，并且做到“业务单据金额 = ledger 金额 = fund account journal 金额 = 账户余额变动”。

4. **删除策略不适合资金系统。**
   对资金、放款、还款、入资等对象进行物理删除，会破坏审计和历史对账。

### QA / Auditor

1. **封装前阻断：健康检查失败。**
   `scripts/health-check.js:112-113` 明确把缺失表标为 P0-9、P0-10 新表。

2. **封装前阻断：财务对账失败。**
   `scripts/test-finance-reconciliation.ts` 对放款、还款和 ledger 做交叉检查，当前发现净现金流和放款 ledger 不一致。

3. **回归脚本存在但不宜在当前库直接运行。**
   `test:regression`、`test:launch-readiness`、`test:external-touchpoints` 会产生测试数据。上线前应在隔离测试库跑完整回归。

4. **审计日志存在但不能替代不可变账本。**
   有 `AuditLog` model，见 `prisma/schema.prisma:797`。但只要核心单据可物理删除，审计仍然无法保证资金历史完整。

5. **缺少端到端验收矩阵。**
   目前没有看到完整 E2E 自动化覆盖三端角色链路。

### Finance / Operations

1. **工作人员出款链路有实现，但资金闭环未通过。**
   后台确认出款会写放款状态、申请状态、还款计划、ledger、资金账户流水，见 `src/app/api/disbursements/[id]/confirm-paid/route.ts:101-165`。但现有数据库对账显示已有放款缺 ledger，不能证明闭环可靠。

2. **资金方入资链路证据不足。**
   `CapitalInflow` 模型字段过轻，缺入资凭证、交易号、确认人、确认时间等操作必备信息。

3. **出款凭证不足。**
   放款缺凭证字段，会影响财务复核、客户争议、资金方对账、监管留痕。

4. **提现链路需要补全资金方余额口径。**
   资金方提现必须明确可提现余额、冻结余额、在途回款、手续费、审批、出款凭证、失败重试和 ledger 关系。

5. **历史数据需要修复，不只是修代码。**
   财务对账失败说明当前库已有不一致数据。上线前需要数据修复脚本和人工复核清单。

## 3. Cross-Cutting Findings

### 3.1 主链路闭环判断

| 主链路 | 当前状态 | 结论 |
| --- | --- | --- |
| 客户注册/登录 | 有入口和 session | 基本可用，但需验证限流表缺失影响 |
| 客户资料/KYC | 有上传和后台查看 | 未与借款准入强绑定 |
| 客户申请借款 | 有申请 API 和产品白名单 | 可用但风控状态不足 |
| 后台审批 | 有通过/拒绝 | 不完整，缺补件/复核/多级审批 |
| 合同签署 | 有签署状态 | 不完整，缺归档和可信证据 |
| 工作人员出款 | 有确认出款 | 逻辑存在，但现有数据对账失败 |
| 客户确认收款 | 有确认 API | 是否起息点需业务确认 |
| 还款计划 | 出款后生成 | 基本有，但需与客户确认收款政策一致 |
| 客户还款 | 有还款与确认机制 | 基本有，但需 E2E 验证和权限修补 |
| 后台确认到账 | 有结算逻辑 | 需要对账验证 |
| 资金方入资 | 有后台入资模型 | 不完整，缺资金方自助和凭证闭环 |
| 资金方提现 | 有模型和入口 | 需要验证审批、出款和 ledger |
| 展期 | 有计划替换 | 缺补充合同/签署 |
| 重组 | 有申请/审批 | 未闭环 |
| 审计与对账 | 有模型和脚本 | 当前对账失败，不能上线 |

### 3.2 关键阻断结论

1. 系统不是闭环。
2. 资金账不是闭环。
3. 当前数据库不是健康状态。
4. 不满足“没有问题封装”的条件。
5. 可以保留构建产物判断为“技术构建通过”，但不能做发布封装判断。

## 4. Priority-Ranked Issue List

| 优先级 | 问题 | 证据 | 影响 | 建议归属 |
| --- | --- | --- | --- | --- |
| P0 | 健康检查失败，缺限流和幂等表 | `scripts/health-check.js:112-113`，命令失败 | 登录、关键请求幂等、防重复提交不可保证 | 后端/DBA |
| P0 | 财务对账失败，已有放款缺 ledger | `npm run test:finance-reconciliation` 失败 | 资金账不可信，不能上线 | DBA/财务/后端 |
| P0 | 净现金流不一致 | `periodNetCashflow expected -19000.00, got 81000.00` | 经营数据和财务报表错误 | 财务/DBA |
| P1 | 还款详情对象级权限缺口 | `src/app/api/repayments/[id]/route.ts:13-37` | 可能越权查看他人还款 | 后端/安全 |
| P1 | 资金相关对象存在物理删除 | disbursement/repayment/capitalInflow delete | 破坏审计和对账 | 架构/后端/财务 |
| P1 | 放款模型不支持分批/多笔出款 | `prisma/schema.prisma:544` | 无法支持复杂放款和失败重试 | 产品/架构 |
| P1 | 放款和入资凭证字段不足 | `prisma/schema.prisma:217-225`、`541-557` | 争议处理、财务复核困难 | 产品/后端/财务 |
| P1 | 状态机分散且为字符串 | `prisma/schema.prisma:416`、`553`、`632` | 非法状态和流程漂移 | 架构/后端 |
| P1 | 重组审批后不生成新计划/合同 | `src/app/api/restructures/[id]/approve/route.ts:35-42` | 重组业务不可用 | 产品/后端 |
| P1 | KYC/风控未强绑定借款准入 | `src/app/api/client/loan-applications/route.ts:155` | 高风险客户可能进件 | 产品/风控/后端 |
| P1 | 测试覆盖不足 | `npm test` 仅 5 个用例 | 不能证明三端链路可用 | QA/后端/前端 |
| P2 | 客户/资金方导航未暴露全部关键页面 | client/funder layout | 用户找不到关键动作 | UX/前端 |
| P2 | 文档 base64 入库 | documents route | DB 膨胀和隐私风险 | 后端/架构 |
| P2 | 产品公开白名单与后台配置双轨 | `src/app/api/client/loan-applications/route.ts` | 配置变更容易不生效 | 产品/后端 |
| P2 | `next lint` 未来废弃 | `package.json:16` | 后续 Next 升级会受影响 | 前端 |

## 5. Hidden Risks

1. **数据库迁移风险。**
   代码已经假设存在 `rate_limit_buckets` 和 `idempotency_keys`，但当前库没有。直接上线会出现运行时错误或保护失效。

2. **历史数据修复风险。**
   财务对账失败不是单靠改代码能解决的，还要修复当前库里的历史放款、ledger、账户流水和统计口径。

3. **权限扩散风险。**
   如果接口只做“是否登录”而不做“是否有权访问这个对象”，角色越多越容易发生数据泄露。

4. **审计不可追溯风险。**
   物理删除资金相关数据会让以后无法解释余额来源、账本差异和客户争议。

5. **幂等不足风险。**
   放款确认、还款确认、提现确认、合同签署都必须防重复提交。缺幂等表时，这些动作存在重复执行风险。

6. **测试库污染风险。**
   当前多个回归脚本会写业务数据。若没有独立测试库，回归验证本身可能污染真实运营数据。

7. **起息口径争议风险。**
   当前是财务确认出款后生成计划；如果业务或合同定义为客户确认收款后起息，会产生利息、逾期和客户争议。

## 6. What To Feed Into crm-restructure

### 目标态必须重构的主链路

1. **客户借款链路**
   注册/登录 -> KYC 完成 -> 风控准入 -> 产品选择 -> 借款申请 -> 审批/补件/拒绝/通过 -> 合同生成 -> 客户签署 -> 待放款。

2. **工作人员出款链路**
   待放款 -> 选择资金账户/资金方 -> 出款申请 -> 复核 -> 上传凭证/交易号 -> 确认出款 -> ledger -> fund account journal -> 客户确认收款 -> 起息/还款计划。

3. **资金方入资链路**
   资金方提交入资/后台代录 -> 上传凭证 -> 财务确认到账 -> 资金账户余额增加 -> ledger/fund account journal -> 可用于放款 -> 资金方 statement 可见。

4. **客户还款链路**
   客户提交还款声明/凭证 -> 自动/人工匹配 -> 后台确认到账 -> 分摊本金/利息/费用 -> 更新期次 -> ledger -> fund account journal -> 资金方收益/余额变动。

5. **资金方提现链路**
   计算可提现 -> 申请提现 -> 审批 -> 财务出款 -> 凭证 -> ledger -> 余额减少 -> statement 展示。

6. **展期/重组链路**
   申请 -> 审批 -> 费用/新计划 -> 补充合同 -> 客户签署 -> 旧计划废弃 -> 新计划生效 -> ledger/审计留痕。

### 需要进入下一轮设计的核心对象

- 统一状态机：Application、Contract、Disbursement、Repayment、RepaymentPlan、CapitalInflow、Withdrawal、Extension、Restructure
- 不可变资金账本：所有资金动作只能新增流水或冲正，不能删除
- 资金凭证对象：出款凭证、入资凭证、还款凭证、提现凭证
- 幂等请求对象：所有支付/资金/签署动作都要有幂等键
- 权限策略：角色权限 + 对象归属 + 数据范围
- 对账中心：业务单据、ledger、资金账户、资金方 statement、现金流报表四方一致

## 7. Open Questions

1. 当前连接的数据库是开发库、测试库还是生产库？是否允许执行 `npm run db:push`？
2. 业务起息点到底是“财务确认已出款”还是“客户确认已收款”？
3. 是否必须支持一笔借款多次放款、多个资金方共同出资、部分放款或放款失败重试？
4. 资金方是否需要自助入资，还是永远由后台财务代录？
5. 放款、还款、提现是否需要双人复核或多级审批？
6. 合同是否需要生成 PDF 归档、哈希、可信时间戳、短信/邮箱验证或第三方电子签？
7. KYC 通过标准是什么？是否有黑名单、灰名单、额度规则、在贷限制、逾期限制？
8. 历史财务数据是否可以自动修复，还是必须财务人工复核后修复？
9. 是否有独立测试数据库可以安全执行全量回归脚本？
10. 上线封装的定义是什么：仅构建包、Docker 镜像、部署包，还是包含数据库迁移和验收报告？

## 最终审计意见

当前系统已经有借贷系统的主体骨架：三端入口、客户申请、后台审批、合同、放款、还款、资金方、ledger、审计日志、健康检查和若干回归脚本都已经存在。

但从“可用智能借贷系统”的标准看，当前还没有闭环。尤其是 P0 的数据库健康检查失败和财务对账失败，直接阻断封装发布。下一步应先修复 P0，再按 P1 清单补权限、凭证、状态机、重组闭环和不可变账本，最后在隔离测试库执行全量回归和财务对账，通过后再封装。
