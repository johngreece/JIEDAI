# 合同金额全链路一致性

更新日期：2026-07-15

## 已关闭的问题

此前合同正文可以列示“基础本金 + 并入本金收益 = 合同本金”，但正式合同记录没有对应数据库字段。放款、还款计划、实时应还和还款确认继续读取申请金额，导致同一笔贷款可能出现多套本金。

## 统一金额口径

1. 系统币种固定为 `EUR`，继续由 `src/lib/system-config.ts` 单一配置。
2. 新主合同必须持久化 `basePrincipal`、`capitalizedInterestAmount`、`contractPrincipal`、`legalServiceFee` 和 `feePaymentMode`。
3. 服务端强制校验 `contractPrincipal = basePrincipal + capitalizedInterestAmount`，并校验法律服务费非负且小于基础本金。
4. `UPFRONT_DEDUCTION`：法律服务费从基础本金中前置扣除，不再进入还款计划费用。
5. `FULL_AMOUNT`：客户收到完整基础本金，法律服务费作为还款计划费用单独应还。
6. 合同本金已经包含正常收益，实时应还不得再次叠加产品正常利率；到期后仍按快照中的逾期规则计算。
7. 放款毛额必须等于已签合同基础本金；客户债务台账和还款计划本金必须等于已签合同本金。
8. 还款期次把合同本金拆回基础本金与已并入收益；确认还款后分别进入 `principalPart` 和 `interestPart`，避免利润被误记为本金回收。

## 历史数据兼容

读取顺序为：合同结构化字段、历史 `variableData.contractGenerationOptions`、申请金额回退。结构化字段或有效历史快照存在时，放款接口拒绝与已签合同金额不一致的请求。

## Supabase 发布步骤

本次仅向 `contracts` 表增加可空金额列、费用模式列和带默认值的 EUR 币种列，不改写历史记录。生产发布前必须在连接真实 Supabase 的受控环境执行：

```powershell
npm run db:generate
npm run db:push
```

随后运行 `npm run verify` 和一笔测试贷款的“生成合同 -> 签署 -> 创建放款 -> 确认打款 -> 查看计划 -> 发起还款”冒烟链路。没有生产数据库凭据时，不应假装已完成 `db:push`。
