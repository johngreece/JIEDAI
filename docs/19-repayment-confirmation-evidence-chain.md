# 还款确认签署证据链

更新日期：2026-07-15

## 目标

客户在还款确认页填写的金额必须真正进入后端校验，并与手写签名、客户身份、IP、设备、状态迁移和时间绑定。后台确认到账、确认未到账或取消记录时，不能覆盖此前的客户签署证据。

## 数据结构

- `RepaymentConfirmation`：当前确认快照，供客户端和管理端快速读取。
- `RepaymentConfirmationEvent`：追加式历史事件，禁止更新和删除。
- `confirmedAmount`：客户实际签署确认的金额，必须与还款单金额完全一致。
- `evidenceJson`：版本化证据内容，不直接重复签名图片，只保存签名 SHA-256。
- `evidenceHash`：`evidenceJson` 的 SHA-256，用于检测证据字段是否被修改。

事件类型：

| 事件 | 主体 | 说明 |
| --- | --- | --- |
| `CLIENT_DECLARED_PAID` | 客户 | 客户确认已付款并提交金额与手写签名 |
| `CLIENT_REJECTED` | 客户 | 客户拒绝当前还款确认 |
| `ADMIN_CONFIRMED_RECEIVED` | 管理员 | 后台确认实际到账 |
| `ADMIN_CONFIRMED_NOT_RECEIVED` | 管理员 | 后台确认未到账并记录原因 |
| `ADMIN_CANCELLED` | 管理员 | 到账前取消已有确认的还款记录 |

## 原子性

1. 先用还款 ID、客户归属和预期状态执行 `updateMany` 原子认领。
2. 当前确认快照、追加式证据事件、客户台账、资金账户流水、逾期解除和借款状态必须使用同一个事务客户端。
3. 任一步失败时，状态和证据事件同时回滚。
4. `RepaymentConfirmationEvent` 只允许通过 `appendRepaymentConfirmationEvidence()` 创建。

## Supabase 发布步骤

本次 Prisma schema 新增表和字段，合并代码前在目标 Supabase 环境执行：

```powershell
npm run db:generate
npm run db:push
```

执行后检查：

- `repayment_confirmations.confirmed_amount` 已存在。
- `repayment_confirmation_events` 表及四组索引已存在。
- 使用一笔测试还款完成客户签署和后台到账确认，事件表应产生两条记录且 `evidence_hash` 均非空。
- 修改签署金额后提交必须返回 `400`，不得产生状态变化或事件记录。
