# 借款业务管理系统 - API 清单

**版本**：1.0  
**约定**：RESTful；认证 Header `Authorization: Bearer <token>`；金额与 ID 以文档与 Prisma 为准。

---

## 一、认证与用户

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录（username+password），返回 JWT |
| POST | /api/auth/refresh | 刷新 Token |
| POST | /api/auth/logout | 登出（可选：使 refresh 失效） |
| GET | /api/auth/me | 当前用户信息与角色权限 |
| PUT | /api/auth/me | 修改当前用户资料（手机/邮箱/密码等） |

---

## 二、用户与权限（系统管理）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/users | 用户列表（分页、筛选） |
| GET | /api/users/:id | 用户详情 |
| POST | /api/users | 创建用户（超管） |
| PUT | /api/users/:id | 更新用户 |
| DELETE | /api/users/:id | 软删除用户 |
| GET | /api/roles | 角色列表 |
| GET | /api/roles/:id | 角色详情（含权限） |
| POST | /api/roles | 创建角色 |
| PUT | /api/roles/:id | 更新角色及权限 |
| GET | /api/permissions | 权限树/列表 |

---

## 三、客户管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/customers | 客户列表（分页、筛选、导出） |
| GET | /api/customers/:id | 客户详情（含 KYC、附件、历史借款） |
| POST | /api/customers | 创建客户 |
| PUT | /api/customers/:id | 更新客户 |
| GET | /api/customers/blacklist | 黑名单/观察名单列表 |
| POST | /api/customers/:id/kyc | 提交/更新 KYC 记录 |
| POST | /api/customers/:id/attachments | 上传客户附件 |
| DELETE | /api/attachments/:id | 删除附件（按权限） |

---

## 四、资金方与资金

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/funders | 资金方列表（按角色 scope） |
| GET | /api/funders/:id | 资金方详情 |
| POST | /api/funders | 创建资金方 |
| PUT | /api/funders/:id | 更新资金方 |
| GET | /api/funders/:id/accounts | 资金账户列表 |
| POST | /api/funders/:id/accounts | 创建资金账户 |
| GET | /api/fund-accounts/:id/inflows | 入金记录列表 |
| POST | /api/fund-accounts/:id/inflows | 入金登记 |
| GET | /api/fund-accounts/:id/ledger | 资金流水/台账 |
| GET | /api/funders/:id/statements | 资金方对账单（时间范围、导出） |

---

## 五、产品与规则

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/loan-products | 产品列表 |
| GET | /api/loan-products/:id | 产品详情（含规则） |
| POST | /api/loan-products | 创建产品 |
| PUT | /api/loan-products/:id | 更新产品（版本化） |
| GET | /api/pricing-rules | 定价规则列表（可按 productId 筛选） |
| POST | /api/pricing-rules | 创建规则 |
| PUT | /api/pricing-rules/:id | 更新规则（生效时间） |
| POST | /api/loan-products/trial | 费用试算（金额、期限、产品） |

---

## 六、借款申请与审批

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/loan-applications | 申请列表（状态、客户、时间） |
| GET | /api/loan-applications/pending-risk | 待风控列表 |
| GET | /api/loan-applications/pending-approval | 待审批列表 |
| GET | /api/loan-applications/:id | 申请详情（含审批流、风控意见） |
| POST | /api/loan-applications | 创建申请（含试算） |
| PUT | /api/loan-applications/:id | 更新申请（草稿） |
| POST | /api/loan-applications/:id/submit | 提交（进入风控） |
| POST | /api/loan-applications/:id/risk | 风控审核（通过/驳回） |
| POST | /api/loan-applications/:id/approve | 审批（通过/驳回/退回） |

---

## 七、合同与签署

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/contract-templates | 合同模板列表 |
| GET | /api/contract-templates/:id | 模板详情 |
| POST | /api/contract-templates | 创建模板 |
| PUT | /api/contract-templates/:id | 更新模板（版本） |
| GET | /api/contracts | 合同列表 |
| GET | /api/contracts/:id | 合同详情（含变量快照、签署记录） |
| POST | /api/loan-applications/:id/generate-contract | 生成合同（审批通过后） |
| GET | /api/contracts/:id/pdf | 合同 PDF 下载/预览 |
| POST | /api/contracts/:id/sign | 提交签署（手写/勾选/验证码 + 设备信息） |
| POST | /api/contracts/:id/cancel | 作废合同 |

---

## 八、放款

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/disbursements | 放款列表（待放款/已放款） |
| GET | /api/disbursements/pending | 待放款列表 |
| GET | /api/disbursements/:id | 放款单详情 |
| POST | /api/disbursements | 创建放款单（合同已签后） |
| PUT | /api/disbursements/:id | 更新（打款信息、凭证） |
| POST | /api/disbursements/:id/confirm-paid | 标记已打款 |
| GET | /api/disbursements/:id/repayment-plan | 关联还款计划 |
| POST | /api/client/disbursements/:id/confirm-received | 客户确认已收款（客户端） |

---

## 九、还款计划

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/loan-applications/:id/repayment-plans | 某申请下还款计划列表（含版本） |
| GET | /api/repayment-plans/:id | 计划详情（含 schedule items） |
| GET | /api/repayment-plans/:id/schedule | 计划明细（每期应还/已还） |
| POST | /api/repayment-plans/:id/recalculate | 重算计划（保留原版本，需权限） |

---

## 十、还款登记与客户确认

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/repayments | 还款记录列表（筛选、导出） |
| GET | /api/repayments/pending-confirm | 待客户确认列表 |
| GET | /api/repayments/review | 人工复核列表 |
| GET | /api/repayments/:id | 还款单详情（分配明细、确认记录） |
| POST | /api/repayments | 登记还款（金额、方式、凭证、可选关联申请） |
| POST | /api/repayments/:id/allocate | 分配至期次（本金/利息/费用/罚息） |
| POST | /api/repayments/:id/confirm | 客户确认（金额、用途、IP/设备留痕） |
| POST | /api/repayments/:id/reject | 客户驳回 / 进入人工复核 |
| PUT | /api/repayments/:id/review | 人工复核结果 |

---

## 十一、逾期、展期、重组

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/overdue | 逾期列表（按客户/申请） |
| GET | /api/overdue/records | 逾期记录明细 |
| GET | /api/extensions | 展期申请列表 |
| POST | /api/loan-applications/:id/extensions | 申请展期 |
| POST | /api/extensions/:id/approve | 审批展期（含补充协议） |
| GET | /api/restructures | 分期重组列表 |
| POST | /api/loan-applications/:id/restructures | 申请分期重组 |
| POST | /api/restructures/:id/approve | 审批重组（新计划+补充协议） |

---

## 十二、台账与对账

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/ledger/loans | 借款台账（筛选、分页、导出） |
| GET | /api/ledger/disbursements | 放款台账 |
| GET | /api/ledger/repayments | 还款台账 |
| GET | /api/ledger/funders | 资金方台账 |
| GET | /api/ledger/customers | 客户往来台账 |
| GET | /api/ledger/daily | 日资金流水 |
| GET | /api/ledger/alerts | 对账差异预警 |

---

## 十三、风控与预警

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/risk/alerts | 预警列表（逾期/大额/重复/身份异常等） |
| GET | /api/risk/high-risk-customers | 高风险客户列表 |
| PUT | /api/risk/alerts/:id | 处理/备注预警 |

---

## 十四、审计日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/audit-logs | 审计日志列表（实体类型、实体ID、用户、时间、分页、导出） |
| GET | /api/audit-logs/entity/:type/:id | 某实体变更历史 |

---

## 十五、消息与通知

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/notifications | 当前用户/客户站内信列表 |
| PUT | /api/notifications/:id/read | 标记已读 |
| GET | /api/settings/notifications | 通知配置（渠道、模板） |
| PUT | /api/settings/notifications | 更新通知配置 |

---

## 十六、系统设置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/settings | 系统设置列表（按 category） |
| GET | /api/settings/:key | 单条配置 |
| PUT | /api/settings/:key | 更新配置（规则引擎参数等） |

---

## 十七、Dashboard / 报表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/dashboard/summary | 驾驶舱汇总：今日放款/收款/逾期、在贷余额、客户数、活跃借款数、逾期率、资金方余额、各资金方收益、待确认还款、待签合同、待放款、风险客户数等 |
| GET | /api/dashboard/charts | 图表数据（可选：趋势、产品分布等） |

---

## 十八、客户端门户（/api/client 前缀）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/client/me | 当前客户信息（关联 user） |
| GET | /api/client/loans | 我的借款列表 |
| GET | /api/client/loans/:id | 借款详情与应还/已还 |
| GET | /api/client/repayment-plans/:id | 还款计划与明细 |
| GET | /api/client/contracts | 我的合同列表 |
| GET | /api/client/contracts/:id | 合同详情与签署入口 |
| POST | /api/client/contracts/:id/sign | 客户签署 |
| POST | /api/client/disbursements/:id/confirm-received | 确认已收款 |
| GET | /api/client/repayments/pending-confirm | 待我确认的还款 |
| POST | /api/client/repayments/:id/confirm | 确认还款金额与用途 |
| POST | /api/client/repayments/upload-proof | 上传还款凭证（可选流程） |
| GET | /api/client/notifications | 我的消息 |

---

## 十九、通用与导出

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/export | 通用导出（传入 type、筛选条件，返回任务 ID 或文件 URL） |
| GET | /api/export/:taskId | 查询导出任务状态/下载 |

---

以上为第一版 API 清单，实际实现时可按模块拆分路由文件（如 Next.js App Router `/api/...` 或 NestJS Controller）。
