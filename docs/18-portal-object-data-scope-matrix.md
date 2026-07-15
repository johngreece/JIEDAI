# 门户对象级数据范围矩阵

## 目标

系统是内部自用，但管理员、客户和资金方仍属于不同信任边界。所有敏感对象必须先完成门户鉴权，再以对象归属条件查询；不能先按主键读取完整对象，再在应用层比较 `customerId` 或 `funderId`。

Supabase 继续作为生产数据库。Prisma 使用服务端数据库连接，因此数据库 RLS 不能替代 API 层对象范围控制；RLS 可以作为纵深防御，但本矩阵中的查询范围是主边界。

## 统一规则

1. 先验证登录态和账号有效状态，再查询业务对象。
2. 管理端先检查权限代码，再执行无租户范围的管理查询。
3. 客户端查询必须带 `customerId`，资金端查询必须带 `funderId` 或所属资金账户集合。
4. 状态写入使用 `updateMany` 原子认领，并重复对象归属、当前状态和软删除条件。
5. 对象不存在和对象不属于当前门户用户统一返回 `404`，避免泄露对象是否存在或当前状态。
6. 门户本身不允许该动作时返回 `403`；参数错误返回 `400`；并发状态变化返回 `409`。
7. 已软删除的客户、借款申请和合同不得进入门户业务链路。

## 当前关键链路

| 接口/服务 | 管理端范围 | 客户端范围 | 资金端范围 | 写入保护 |
| --- | --- | --- | --- | --- |
| `GET /api/contracts/:id` | `contract:view` + `deletedAt = null` | `customerId = session.sub` + `deletedAt = null` | 禁止 | 只读 |
| `POST /api/contracts/:id/sign` | 禁止 | 合同查询和状态认领都带 `customerId` | 禁止 | 合同状态 + 客户归属 + 未删除 |
| `GET /api/loan-applications/:id/realtime` | `loan:view` + `deletedAt = null` | `customerId = session.sub` + `deletedAt = null` | 禁止 | 只读 |
| `POST /api/client/disbursements/:id/confirm-received` | 禁止 | 放款所属申请带 `customerId` | 禁止 | `PAID` + 未确认 + 客户归属 |
| `GET /api/repayments/:id` | `repayment:view` | 还款计划必须属于客户未删除申请集合 | 禁止 | 只读 |
| 客户提交还款确认 | 禁止 | 还款计划必须属于客户未删除申请集合 | 禁止 | 原状态 + 客户申请集合 |
| `GET /api/funder/contracts/:id` | `contract:view` | 禁止 | `funderId = session.sub` | 只读 |
| `GET /api/funder/statements` | `ledger:view` 可指定资金方 | 禁止 | 强制使用 `session.sub`，忽略外部资金方参数 | 只读 |
| `PATCH /api/funder-withdrawals` | `withdrawal:review` | 禁止 | 禁止 | `PENDING` 原子认领 + 账户扣款 + 银行凭证 |
| `GET /api/attachments/:id/file` | `ledger:view` | 禁止 | 入资/放款按资金账户归属，提现按 `funderId = session.sub` | 只读 |

## 本轮修复

- 合同签署不再在客户归属检查前暴露合同状态。
- 资金方合同详情不再由 `findUniqueOrThrow` 把缺失对象转换成服务端错误。
- 客户确认收款的读取、原子认领和结果回读均带客户归属。
- 客户提交还款确认的读取和状态认领均带客户申请集合。
- 实时还款接口在查询前完成门户授权，并兼容客户确认收款后的 `CONFIRMED` 放款状态。
- 增加 `portal-data-scope-guard.test.ts`，阻止关键入口退回无范围主键查询。
- 提现出账使用专用财务权限，资金方只能读取自身提现凭证。

## 后续扩展

- 对新增客户/资金方详情接口建立相同的静态守卫条目。
- 在可用的 Supabase 测试环境中加入双客户、双资金方越权 E2E：自己的对象成功，其他人的对象统一 `404`。
- 对管理员财务导出和批量接口增加字段级最小化，避免为了列表展示加载合同正文、签名、证件或完整联系方式。
