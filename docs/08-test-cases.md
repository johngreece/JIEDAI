# 借款业务管理系统 - 测试用例

## 一、权限与角色测试

| 用例编号 | 场景 | 前置条件 | 操作 | 预期 |
|----------|------|----------|------|------|
| AUTH-01 | 未登录访问工作台 | 无 | GET /api/dashboard/summary 无 Cookie | 200（或 401 若接口要求登录） |
| AUTH-02 | 登录后获取当前用户 | 已登录 | GET /api/auth/me | 200，返回用户信息与 roles |
| AUTH-03 | 业务员无权限访问用户管理 | 业务员登录 | GET /api/users | 403 |
| AUTH-04 | 超管可访问用户管理 | 超管登录 | GET /api/users | 200 |
| AUTH-05 | 资金方管理员仅见己方资金方 | 资金方角色+scope | GET /api/funders | 200，列表仅包含 scope 内资金方 |

---

## 二、借款流程测试

| 用例编号 | 场景 | 前置条件 | 操作 | 预期 |
|----------|------|----------|------|------|
| LOAN-01 | 创建借款申请草稿 | 业务员登录、有客户与产品 | POST /api/loan-applications | 201，状态 draft |
| LOAN-02 | 费用试算 | 有产品与定价规则 | POST /api/loan-products/trial body: amount, term, productId | 200，返回试算结果 |
| LOAN-03 | 提交申请进入风控 | 申请 draft | POST /api/loan-applications/:id/submit | 200，状态 pending_risk |
| LOAN-04 | 风控驳回 | 申请 pending_risk | POST /api/loan-applications/:id/risk body: result=reject | 200，状态 risk_rejected |
| LOAN-05 | 风控通过进入审批 | 申请 pending_risk | POST /api/loan-applications/:id/risk result=pass | 200，状态 pending_approval |
| LOAN-06 | 审批通过 | 申请 pending_approval | POST /api/loan-applications/:id/approve result=pass | 200，状态 approved |
| LOAN-07 | 生成合同 | 申请 approved | POST /api/loan-applications/:id/generate-contract | 200，生成合同 pending_sign |
| LOAN-08 | 客户签署合同 | 合同 pending_sign、客户登录 | POST /api/contracts/:id/sign | 200，合同 signed |
| LOAN-09 | 创建放款单 | 合同 signed、有资金账户 | POST /api/disbursements | 201 |
| LOAN-10 | 客户确认收款 | 放款 paid、客户登录 | POST /api/client/disbursements/:id/confirm-received | 200，放款 confirmed |

---

## 三、还款与确认测试

| 用例编号 | 场景 | 前置条件 | 操作 | 预期 |
|----------|------|----------|------|------|
| REPAY-01 | 财务登记还款 | 财务登录、有借款与计划 | POST /api/repayments body: amount, payType, paidAt, applicationId | 201，状态 registered |
| REPAY-02 | 分配至期次 | 还款 registered | POST /api/repayments/:id/allocate body: scheduleItemId, 本金/利息/费用 | 200，状态 pending_confirm |
| REPAY-03 | 客户确认还款 | 还款 pending_confirm、客户登录 | POST /api/client/repayments/:id/confirm result=confirmed | 200，状态 confirmed |
| REPAY-04 | 客户驳回还款 | 还款 pending_confirm | POST /api/client/repayments/:id/confirm result=rejected | 200，状态 rejected |
| REPAY-05 | 待确认列表仅含 pending_confirm | 有若干还款 | GET /api/repayments/pending-confirm | 200，仅返回 status=pending_confirm |

---

## 四、对账与一致性测试

| 用例编号 | 场景 | 前置条件 | 操作 | 预期 |
|----------|------|----------|------|------|
| LEDGER-01 | 放款后资金账户余额减少 | 放款单确认打款 | 查 fund_account.balance、ledger_entries | 余额减少量=放款金额，有一条 disbursement 台账 |
| LEDGER-02 | 入金后资金账户余额增加 | 入金登记 | 查 balance、ledger 类型 inflow | 余额增加=入金金额 |
| LEDGER-03 | 还款确认后计划项已还金额更新 | 还款 confirmed 且已分配 | 查 repayment_schedule_items 对应期 principal_paid 等 | 与 allocation 一致 |
| LEDGER-04 | 借款台账可追溯到申请与放款 | 有已放款申请 | GET /api/ledger/loans 查一条，反查 applicationId、disbursementId | 关联正确 |

---

## 五、审计日志测试

| 用例编号 | 场景 | 前置条件 | 操作 | 预期 |
|----------|------|----------|------|------|
| AUDIT-01 | 审批通过写审计 | 审批通过 | POST approve 后 GET /api/audit-logs?entityType=loan_application&entityId=xxx | 有一条 action=approve |
| AUDIT-02 | 还款确认写审计 | 客户确认还款 | POST confirm 后查 audit_logs entityType=repayment_confirmation | 有一条 action=repay_confirm |
| AUDIT-03 | 金额变更记录 old/new | 修改某金额并写 audit | 查该实体 audit 记录 | oldValue、newValue 含该金额字段 |

---

## 六、合同变量引擎测试（单元）

| 用例编号 | 场景 | 输入 | 预期 |
|----------|------|------|------|
| VAR-01 | 解析变量名 | HTML 含 `{{ customer_name }}`、`{{ loan_amount }}` | parseVariableNames 返回 ['customer_name','loan_amount'] |
| VAR-02 | 填充模板 | 模板 "甲方：{{ customer_name }}"  context { customer_name: "张三" } | fillTemplate 输出 "甲方：张三" |
| VAR-03 | 必填校验 | required=['loan_amount']，context 无 loan_amount | validateRequired 返回 valid: false, missing: ['loan_amount'] |

---

## 七、执行说明

- 接口测试：可用 Postman/Thunder Client 或 Vitest + fetch 编写 e2e。
- 权限测试：需先 seed 不同角色用户，用其 token 调接口。
- 对账测试：需在测试库中准备放款、还款、入金数据后断言余额与台账。
- 单元测试：合同变量引擎、还款状态机等可在 `src/lib` 下用 Vitest 编写。
