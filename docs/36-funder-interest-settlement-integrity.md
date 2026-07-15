# 资金方收益结算完整性

更新日期：2026-07-15

## 目标

资金方收益结算只负责确认应计收益并计入内部资金账户，不直接代表银行付款。银行出款只有一条权威链路：资金方发起提现，财务审批并保存银行流水、付款账户和受保护付款凭证。

## 状态链

`DUE -> POSTED_BY_PLATFORM -> CONFIRMED_BY_FUNDER`

- `DUE`：系统按资金合作规则生成待处理收益。
- `POSTED_BY_PLATFORM`：财务发布周期、金额和结算说明，尚未改变资金账户余额。
- `CONFIRMED_BY_FUNDER`：资金方确认后，在同一事务中追加 `INTEREST_SETTLEMENT / CREDIT` 流水，并增加内部余额和累计收益。
- `FUNDER_DISPUTED`：资金方对周期或金额提出异议；财务修正说明后可重新发布。

## 强制不变量

1. 发布结算不得创建资金流水，也不得改变余额或累计收益。
2. 只有 `POSTED_BY_PLATFORM` 可以被资金方确认或提出异议。
3. 确认状态、`confirmedAt`、资金流水、余额和累计收益必须在同一事务提交。
4. `funder_interest_settlement + settlementId` 只能存在一条资金流水；重复确认必须幂等。
5. 并发状态抢占失败返回 `409`，不得覆盖另一个人的决定。
6. 银行转账信息和付款凭证不得写入收益结算；只允许存在于提现审批链路。
7. 发布权限为 `settlement:manage`，查看权限为 `settlement:view`，不可复用流水查看权限代替结算管理权限。

## 对账规则

- 非 `CONFIRMED_BY_FUNDER` 状态存在收益流水时，生成 `INTEREST_SETTLEMENT_WITHOUT_CONFIRMATION` 差异。
- 已确认结算必须存在金额一致的 `INTEREST_SETTLEMENT / CREDIT` 流水。
- 资金账户余额和累计收益必须包含所有已确认结算；累计流出只由放款和已批准提现产生。
- 实际银行付款仅与已批准提现及其付款凭证核对，不与收益结算发布事件核对。

## 生产迁移

生产预检时收益结算记录和相关流水均为 0，因此本次状态语义调整不需要历史回填。数据库保留原列名映射以避免免费层环境执行破坏性重建，并新增发布人外键和索引，后续通过 Prisma 字段统一使用 `postedAt`、`postedById`、`disputedAt` 和 `disputeReason`。
