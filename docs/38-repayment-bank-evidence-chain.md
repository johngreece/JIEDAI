# 还款银行证据闭环

更新日期：2026-07-15

## 目标

内部 EUR 还款只有在可核对真实付款证据时才能进入客户台账和资金账户流水。Supabase PostgreSQL 保存结构化证据和附件索引，Supabase Storage 保存私有凭证文件。

## 强制证据

每笔 `Repayment` 必须包含：

- 全局唯一 `transactionId`：银行交易号或现金收据号，防止同一凭证重复入账。
- `payerBank`：付款银行、支付渠道或现金渠道。
- `payerAccount`：付款账号、付款人或现金来源快照。
- 一个未删除的 `Attachment`，`entityType=repayment` 且 `category=REPAYMENT_PAYMENT_PROOF`。

客户和后台登记接口使用同一校验器。凭证文件只允许 JPG、PNG、WebP、PDF，最大 10 MB；也支持 HTTPS 证据链接作为运维降级入口。

## 原子边界

1. 私有文件先上传到 Supabase Storage。
2. `Repayment` 和 `Attachment` 在同一 Prisma 事务中创建。
3. 数据库失败时清理刚上传的私有文件。
4. 重复 `transactionId` 返回 `409`，不创建还款或附件。
5. 管理端确认到账时，在入账事务内部重新读取未删除凭证；银行字段或凭证缺失时返回 `409`。
6. 确认成功后，凭证 ID、文件名和付款来源同时写入追加式哈希事件、资金流水元数据和后台审计日志。

## 权限边界

- 客户只能读取归属于自己借款申请的还款凭证。
- 管理员必须具备 `repayment:view`。
- 资金方不能读取客户还款凭证，避免暴露客户付款账号。
- 外部链接仅允许 HTTP(S) 重定向；私有对象通过受鉴权下载路由读取，不暴露 Supabase Service Role Key。

## 自动检测

`FinanceReconciliationService` 对已确认还款检查：

- `REPAYMENT_BANK_EVIDENCE_MISSING`
- `REPAYMENT_PAYMENT_PROOF_MISSING`
- 客户台账、资金流水、分配总额和组成金额一致性

`npm run check:invariants` 和 `repayment-payment-evidence-guard.test.ts` 防止后续代码重新引入无凭证登记或绕过确认闸门。
