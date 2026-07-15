# 旧资金方分润写链退役

更新日期：2026-07-15

## 问题

系统曾同时存在两条资金方收益结算写链：

- `FundProfitShare`：按时间段生成聚合行，并可直接标记 `SETTLED`，但不写资金流水、不变更账户余额，也不绑定提现凭证。
- `FunderInterestSettlement`：按放款和计费周期生成结算单，平台发布后由资金方确认，确认与内部账户入账在同一事务完成。

旧链可能产生“页面已结算、内部账户未入账、银行也无出款证据”的假闭环。

## 决策

1. `FunderInterestSettlement` 是资金方收益结算唯一业务来源。
2. `/api/settlement` 仅保留经营分析 GET，不再提供分润生成或结算 POST。
3. 财务结算中心的期间测算仍由 `SettlementService` 只读计算，但结算状态、已生成金额和已确认金额均汇总自 `FunderInterestSettlement`。
4. 银行出金继续只允许通过 `FunderWithdrawal` 完成并保存银行流水与受保护凭证。
5. `FundProfitShare` 表暂留作 schema 兼容；生产预检为 0 条，不做历史迁移，也不允许应用代码写入。

## 验收

- 旧 API 不再导出 `POST`。
- `src` 中不存在 `fundProfitShare.create/update/delete/upsert`。
- 财务页不存在 `existingSettlement` 旧状态来源。
- 静态 invariant 和 Vitest 守卫阻止旧写链重新引入。
