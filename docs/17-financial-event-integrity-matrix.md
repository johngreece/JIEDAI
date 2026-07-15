# 资金事件一致性矩阵

更新日期：2026-07-15

## 1. 统一规则

1. `LedgerEntry` 和 `FundAccountJournal` 只允许追加，禁止更新和删除。
2. 已确认的放款、还款、入金、提现和资金方收益结算不得硬删除；错误通过取消或冲正流水保留原始轨迹。
3. 业务状态、资金账户余额、客户/资金方流水和留痕必须使用同一个 Prisma 事务客户端；后台人员写 `AuditLog`，客户/资金方门户动作写签名、确认时间、IP、设备或业务证据字段。
4. 状态确认必须使用预期状态条件抢占；更新数量不是 1 时返回 `409`，禁止覆盖并发请求。
5. 每条流水使用稳定的 `referenceType + referenceId`，数据库唯一约束是最终幂等防线。
6. `FunderInterestSettlement` 是资金方收益结算唯一业务来源；`FundProfitShare` 仅保留旧 schema 兼容，不允许新增、更新或作为“已结算”状态来源。

## 2. 事件矩阵

| 资金事件 | 业务状态迁移 | 客户台账 | 资金方流水/余额 | 审计 | 冲正方式 |
|---|---|---|---|---|---|
| 资金方入金确认 | `PENDING -> CONFIRMED` | 无 | `CAPITAL_INFLOW / CREDIT`，增加余额和累计入金 | 银行流水、付款账户、受保护凭证、复核人和后台 `AuditLog` 同事务 | 原入金转 `CANCELLED`，追加 `capital_inflow_reversal / DEBIT` |
| 放款确认支付 | `PENDING -> PAID` | `DISBURSEMENT / CREDIT`，债务本金取已签合同本金 | `DISBURSEMENT / DEBIT`，实际流出取合同净放款额 | 后台 `AuditLog` 同事务，并记录合同金额来源 | 支付前仅允许取消；支付后不得直接回退 |
| 客户确认收款 | `PAID -> CONFIRMED` | 无新增 | 无新增 | 同一原子更新保存确认时间、IP、设备和证据 | 不回退，仅补充运营备注 |
| 客户签署还款报备 | `PENDING_CONFIRM -> CUSTOMER_CONFIRMED` | 暂不入账 | 暂不入账 | 校验签署金额，保存当前快照并追加带哈希的签署证据事件 | 后台未收到走拒绝事件；历史签署事件不覆盖 |
| 管理端确认还款到账 | `CUSTOMER_CONFIRMED -> CONFIRMED` | `REPAYMENT / DEBIT` | `REPAYMENT / CREDIT`，增加余额和收益累计 | 后台 `AuditLog` 同事务 | 未到账走拒绝分支；已确认不得取消 |
| 资金方提现审批 | `PENDING -> APPROVED` | 无 | `WITHDRAWAL / DEBIT`，减少余额并增加累计流出 | 后台 `AuditLog` 同事务 | 审批前可拒绝，审批后不得覆盖 |
| 资金方收益确认 | `POSTED_BY_PLATFORM -> CONFIRMED_BY_FUNDER` | 无 | 仅确认时追加 `INTEREST_SETTLEMENT / CREDIT`，增加内部账户余额和累计收益 | `postedAt`、`postedById` 留下发布人轨迹；`confirmedAt` 与资金流水同事务 | 金额或周期有误走 `FUNDER_DISPUTED`；银行出款仅走提现审批，不得从结算单直接付款 |

## 3. 引用类型

| `referenceType` | `referenceId` | 唯一业务来源 |
|---|---|---|
| `capital_inflow` | `CapitalInflow.id` | 资金方入金 |
| `capital_inflow_reversal` | `CapitalInflow.id` | 入金冲正 |
| `disbursement` | `Disbursement.id` | 放款 |
| `repayment` | `Repayment.id` | 还款 |
| `funder_withdrawal` | `FunderWithdrawal.id` | 资金方提现 |
| `funder_interest_settlement` | `FunderInterestSettlement.id` | 资金方收益结算 |

## 4. 代码门禁

- `writeAuditLogInTransaction()`：后台人员触发的资金事务内审计公共入口；门户主体 ID 不写入 `AuditLog.userId`。
- `writeLedgerEntry()`：客户台账追加入口。
- `writeFundAccountLedgerEntryAndUpdateAccount()`：资金方流水和余额原子入口。
- `appendRepaymentConfirmationEvidence()`：客户签署和后台确认决定的追加式证据入口，哈希绑定金额、签名、主体和状态迁移。
- `financial-record-immutability-guard.test.ts`：阻止流水改删、绕过服务创建流水和资金业务记录硬删除。
- `funder-interest-settlement-integrity-guard.test.ts`：阻止旧 `FundProfitShare` 写入口复活，并确保财务结算页只读取真实收益结算单状态。
- 真实 Supabase 可用后，补充 10 路并发、事务故障注入和对账零差异测试。

## 5. 自动对账闭环

- `FinanceReconciliationService` 每日全历史扫描业务单据、客户台账、资金流水、余额快照和账户累计值。
- 对账批次写入 `finance_reconciliation_runs`，差异写入 `finance_reconciliation_findings`；每项差异都有责任域、建议动作和处理状态。
- `/admin/finance-reconciliation` 只提供扫描、标记已处理和带说明忽略，不提供历史账本改写入口。
- `npm run finance:reconcile` 是只读检查命令；发现差异时以非零状态退出。
- 每日维护任务发现未处理差异时，该阶段失败并创建内部告警，阻止把当日资金链视为已闭环。
- `financial-record-immutability-guard.test.ts` 同时扫描 `src` 与 TypeScript 运维脚本，防止重新引入账本更新、删除或旁路创建。
