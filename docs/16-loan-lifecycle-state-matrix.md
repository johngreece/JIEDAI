# 借款生命周期状态矩阵

更新日期：2026-07-15

## 1. 适用范围

本矩阵是借款申请主链路的唯一状态定义，覆盖提交、风控、审批、合同签署、放款确认、还款结清和申请取消。页面可以展示状态，但不得自行决定状态迁移；所有写入必须通过 `transitionLoanApplication()`。

## 2. 正常主链路

`DRAFT -> PENDING_RISK -> PENDING_APPROVAL -> APPROVED -> CONTRACTED -> DISBURSED -> SETTLED`

| 动作 | 前置状态 | 目标状态 | 主责权限/身份 | 关键进入条件 |
|---|---|---|---|---|
| SUBMIT | DRAFT | PENDING_RISK | `loan:create` | 客户资料完整 |
| RESUBMIT | REJECTED | PENDING_RISK | `loan:create` | 已修正资料，清除原拒绝信息 |
| RISK_PASS | PENDING_RISK | PENDING_APPROVAL | `loan:risk` | 风控资料完整 |
| RISK_REJECT | PENDING_RISK | REJECTED | `loan:risk` | 写入拒绝原因 |
| APPROVE | PENDING_APPROVAL | APPROVED | `loan:approve` | 写入审批金额 |
| APPROVAL_REJECT | PENDING_APPROVAL | REJECTED | `loan:approve` | 写入拒绝原因 |
| SIGN_CONTRACT | APPROVED | CONTRACTED | 客户本人 | 主合同签名证据已写入 |
| CONFIRM_DISBURSEMENT | CONTRACTED | DISBURSED | `disbursement:confirm` | 放款单仍为 PENDING，资金流水和还款计划同事务写入 |
| SETTLE | DISBURSED | SETTLED | `repayment:confirm` | 全部应还金额已确认到账 |
| CANCEL | DRAFT / REJECTED | CANCELLED | `loan:create` | 无合同、放款单和还款计划 |

## 3. 终态与恢复

- `SETTLED`：正常结清，不允许恢复到活动状态。
- `CANCELLED`：申请已取消，不允许恢复；需要重新借款时创建新申请。
- `REJECTED`：不是永久终态，只能通过显式 `RESUBMIT` 回到 `PENDING_RISK`。
- 历史 `COMPLETED` 仅作为旧数据终态读取，不再产生新写入。

## 4. 历史状态

`SUBMITTED`、`PENDING_CONTRACT`、`CONTRACT_SIGNED`、`PENDING_DISBURSEMENT`、`OVERDUE`、`COMPLETED` 仅用于兼容历史数据。新业务写入不得生成这些值。`OVERDUE` 历史记录允许结清到 `SETTLED`；当前逾期事实由还款计划项和逾期记录持有，借款申请继续保持 `DISBURSED`。

## 5. 并发与审计规则

1. 状态写入必须使用 `WHERE id = ? AND status = ? AND deleted_at IS NULL` 抢占预期状态。
2. 抢占数量不是 1 时返回冲突，禁止覆盖其他请求刚完成的状态。
3. 后台人员触发的状态写入和 `AuditLog` 必须使用同一个 Prisma 事务客户端。
4. 客户/资金方动作不向 `AuditLog.userId` 写入门户主体 ID；使用签名、确认记录或业务证据字段在同事务留痕。
5. 后台审计记录至少包含 `from`、`to`、`action`、操作人和变更摘要。
6. 取消待打款放款单只取消放款单，申请继续保持 `CONTRACTED`，以便重新创建放款单；禁止回退到 `APPROVED`。
