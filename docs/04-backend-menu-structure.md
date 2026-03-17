# 借款业务管理系统 - 后台页面菜单结构与信息架构

> 版本：v2.0 | 更新日期：2026-03-17
> 覆盖：管理后台完整菜单树 + 客户端门户 + 角色权限矩阵 + 前端路由规划

---

## 1. 管理后台菜单层级总览

```
📊 工作台 / Dashboard
│   ├── 老板驾驶舱（13 项核心指标）
│   └── 待办中心（待审、待签、待放、待确认）
│
👥 客户管理
│   ├── 客户列表（筛选/搜索/分页/导出）
│   ├── 新增客户
│   ├── 客户详情
│   │   ├── 基本信息（含紧急联系人）
│   │   ├── 身份/KYC 认证
│   │   ├── 附件管理（证件、工资单、担保材料等）
│   │   ├── 历史借款记录
│   │   ├── 往来台账
│   │   └── 风险标签 & 备注
│   ├── 黑名单管理
│   ├── 观察名单管理
│   └── 客户导入（批量）
│
💰 资金管理
│   ├── 资金方列表
│   ├── 新增资金方
│   ├── 资金方详情
│   │   ├── 基本信息 & 协议
│   │   ├── 资金账户列表
│   │   └── 分润设置
│   ├── 资金账户管理
│   ├── 入金登记
│   ├── 入金记录列表
│   ├── 资金流水
│   ├── 资金方对账单
│   └── 分润结算记录
│
📦 产品与规则
│   ├── 借款产品列表
│   ├── 新增/编辑产品
│   ├── 定价规则管理
│   │   ├── 利率规则
│   │   ├── 服务费/管理费规则
│   │   ├── 逾期罚息规则
│   │   ├── 展期费规则
│   │   ├── 违约金规则
│   │   ├── 提前还款规则
│   │   └── 最低还款额规则
│   └── 规则版本历史
│
📋 借款业务
│   ├── 借款申请列表（全部）
│   ├── 新增借款申请（含费用试算）
│   ├── 借款申请详情
│   │   ├── 申请信息
│   │   ├── 费用试算结果
│   │   ├── 审批流时间线
│   │   ├── 关联合同
│   │   ├── 关联放款
│   │   └── 关联还款计划
│   ├── 待风控审核
│   ├── 待审批
│   ├── 合同管理
│   │   ├── 合同模板管理
│   │   │   ├── 模板列表
│   │   │   └── 模板编辑（变量配置）
│   │   ├── 合同列表
│   │   ├── 待签署合同
│   │   └── 合同详情
│   │       ├── 合同内容预览
│   │       ├── 签署记录（签名/IP/时间/设备）
│   │       └── 附件
│   ├── 放款管理
│   │   ├── 待放款列表
│   │   ├── 放款记录
│   │   ├── 放款详情
│   │   │   ├── 金额明细（应放/扣费/实到）
│   │   │   ├── 打款信息 & 凭证
│   │   │   ├── 资金来源
│   │   │   └── 客户确认状态
│   │   └── 放款操作（打款+上传凭证）
│   └── 还款计划查询
│       ├── 计划列表
│       └── 计划详情（每期明细）
│
💳 还款与核销
│   ├── 还款登记（新增还款）
│   ├── 还款记录列表
│   ├── 待确认还款（等待客户确认）
│   ├── 人工复核列表
│   ├── 还款详情
│   │   ├── 还款信息 & 凭证
│   │   ├── 分配明细（本金/利息/费用/罚息）
│   │   ├── 客户确认记录
│   │   └── 关联借款信息
│   └── 核销记录
│
⚠️ 逾期与重组
│   ├── 逾期列表（实时逾期状态）
│   ├── 逾期详情
│   │   ├── 逾期天数 & 罚息计算
│   │   ├── 催收记录
│   │   └── 处理方案
│   ├── 展期申请列表
│   ├── 展期审批
│   ├── 分期重组列表
│   ├── 重组审批
│   └── 补充协议管理
│
📊 台账与对账
│   ├── 借款台账
│   ├── 放款台账
│   ├── 还款台账
│   ├── 资金方台账
│   ├── 客户往来台账
│   ├── 日资金流水汇总
│   ├── 每日应收/实收/未收
│   ├── 对账差异预警
│   └── 导出中心（Excel / PDF）
│
🛡️ 风控与预警
│   ├── 预警列表
│   │   ├── 逾期预警
│   │   ├── 大额借款预警
│   │   ├── 重复借款预警
│   │   ├── 身份异常预警
│   │   └── 合同修改频繁预警
│   ├── 高风险客户列表
│   └── 人工审核备注
│
🔔 消息与通知
│   ├── 站内信（收件箱）
│   ├── 通知发送记录
│   └── 通知配置
│       ├── 短信模板
│       ├── 邮件模板
│       └── 提醒频率设置
│
⚙️ 系统管理
│   ├── 用户管理
│   │   ├── 用户列表
│   │   ├── 新增用户
│   │   └── 用户详情（角色分配）
│   ├── 角色与权限
│   │   ├── 角色列表
│   │   └── 权限配置
│   ├── 审计日志
│   │   ├── 操作日志列表（筛选）
│   │   ├── 金额变更日志
│   │   └── 登录日志
│   └── 系统设置
│       ├── 审批门槛配置
│       ├── 大额二审阈值
│       ├── 客户确认超时天数
│       ├── 逾期提醒频率
│       └── 其他参数
│
📈 报表
    ├── 老板驾驶舱 Dashboard
    │   ├── 今日放款金额
    │   ├── 今日收款金额
    │   ├── 今日逾期金额
    │   ├── 在贷余额
    │   ├── 客户总数
    │   ├── 活跃借款客户数
    │   ├── 逾期率
    │   ├── 资金方余额
    │   ├── 各资金方收益
    │   ├── 待确认还款
    │   ├── 待签合同
    │   ├── 待放款单
    │   └── 风险客户数
    └── 导出中心
```

---

## 2. 按角色可见菜单矩阵

| 菜单 | 超级管理员 | 业务员 | 风控 | 审批经理 | 财务 | 资金方 | 法务 | 催收 | 审计/老板 |
|------|:----------:|:------:|:----:|:--------:|:----:|:------:|:----:|:----:|:---------:|
| 工作台/Dashboard | ✅全部 | ✅部分 | ✅部分 | ✅部分 | ✅部分 | ✅己方 | ✅部分 | ✅部分 | ✅全部 |
| 客户管理 | ✅ CRUD | ✅ CR | 只读 | 只读 | — | — | 只读 | 只读 | 只读 |
| 资金管理 | ✅ CRUD | — | — | — | ✅ CRU | ✅ 己方 | — | — | 只读 |
| 产品与规则 | ✅ CRUD | 只读 | 只读 | 只读 | — | — | 只读 | — | 只读 |
| 借款申请 | ✅ CRUD | ✅ CR | ✅ 审核 | ✅ 审批 | 只读 | 只读 | 只读 | 只读 | 只读 |
| 合同管理 | ✅ CRUD | 只读 | 只读 | 只读 | 只读 | 只读 | ✅ CRU | 只读 | 只读 |
| 放款管理 | ✅ CRUD | 只读 | — | — | ✅ CRU | 只读 | 只读 | — | 只读 |
| 还款与核销 | ✅ CRUD | — | — | — | ✅ CRU | — | — | 只读 | 只读 |
| 逾期与重组 | ✅ CRUD | 申请 | 只读 | ✅ 审批 | — | — | 只读 | ✅ CRU | 只读 |
| 台账与对账 | ✅ | 只读 | 只读 | 只读 | ✅ | 己方只读 | 只读 | 只读 | ✅全部 |
| 风控与预警 | ✅ | 只读 | ✅ CRU | 只读 | — | — | — | ✅ CRU | 只读 |
| 消息通知 | ✅ CRUD | 只读 | 只读 | 只读 | 只读 | 只读 | 只读 | 只读 | 只读 |
| 系统管理 | ✅ CRUD | — | — | — | — | — | — | — | 只读(日志) |
| 报表 | ✅全部 | 受限 | 受限 | 受限 | 受限 | 己方 | — | 受限 | ✅全部 |

---

## 3. 前端路由命名规划

### 3.1 管理后台路由

| 路径 | 说明 | 权限 |
|------|------|------|
| `/` | 重定向到 /dashboard | 全部 |
| `/dashboard` | 工作台/驾驶舱 | 全部(按角色差异化) |
| `/login` | 登录页 | 公开 |
| **客户管理** | | |
| `/customers` | 客户列表 | customer:read |
| `/customers/new` | 新增客户 | customer:create |
| `/customers/[id]` | 客户详情 | customer:read |
| `/customers/[id]/edit` | 编辑客户 | customer:update |
| `/customers/blacklist` | 黑名单 | customer:read |
| `/customers/watchlist` | 观察名单 | customer:read |
| **资金管理** | | |
| `/funders` | 资金方列表 | funder:read |
| `/funders/new` | 新增资金方 | funder:create |
| `/funders/[id]` | 资金方详情 | funder:read |
| `/funders/[id]/accounts` | 资金账户 | fund_account:read |
| `/funders/inflows` | 入金记录 | capital_inflow:read |
| `/funders/inflows/new` | 入金登记 | capital_inflow:create |
| `/funders/ledger` | 资金流水 | ledger:read |
| `/funders/statements` | 对账单 | ledger:read |
| `/funders/profit-shares` | 分润记录 | profit_share:read |
| **产品与规则** | | |
| `/products` | 产品列表 | product:read |
| `/products/new` | 新增产品 | product:create |
| `/products/[id]` | 产品详情/编辑 | product:read |
| `/products/rules` | 定价规则 | pricing_rule:read |
| `/products/rules/new` | 新增规则 | pricing_rule:create |
| `/products/rules/[id]` | 规则详情 | pricing_rule:read |
| **借款业务** | | |
| `/loans` | 借款申请列表 | loan:read |
| `/loans/new` | 新增借款申请 | loan:create |
| `/loans/[id]` | 申请详情 | loan:read |
| `/loans/pending-risk` | 待风控 | loan:risk_review |
| `/loans/pending-approval` | 待审批 | loan:approve |
| **合同管理** | | |
| `/contracts` | 合同列表 | contract:read |
| `/contracts/templates` | 合同模板 | contract_template:read |
| `/contracts/templates/new` | 新增模板 | contract_template:create |
| `/contracts/templates/[id]` | 模板编辑 | contract_template:update |
| `/contracts/[id]` | 合同详情 | contract:read |
| `/contracts/[id]/sign` | 合同签署页 | contract:sign |
| `/contracts/pending-sign` | 待签署合同 | contract:read |
| **放款管理** | | |
| `/disbursements` | 放款记录 | disbursement:read |
| `/disbursements/pending` | 待放款 | disbursement:read |
| `/disbursements/[id]` | 放款详情 | disbursement:read |
| `/disbursements/[id]/pay` | 放款操作 | disbursement:create |
| **还款管理** | | |
| `/repayments` | 还款记录 | repayment:read |
| `/repayments/register` | 还款登记 | repayment:create |
| `/repayments/pending-confirm` | 待确认 | repayment:read |
| `/repayments/review` | 人工复核 | repayment:review |
| `/repayments/[id]` | 还款详情 | repayment:read |
| **还款计划** | | |
| `/repayment-plans` | 计划列表 | repayment_plan:read |
| `/repayment-plans/[id]` | 计划详情 | repayment_plan:read |
| **逾期与重组** | | |
| `/overdue` | 逾期列表 | overdue:read |
| `/overdue/[id]` | 逾期详情 | overdue:read |
| `/extensions` | 展期列表 | extension:read |
| `/extensions/new` | 展期申请 | extension:create |
| `/extensions/[id]` | 展期详情/审批 | extension:read |
| `/restructures` | 重组列表 | restructure:read |
| `/restructures/new` | 重组申请 | restructure:create |
| `/restructures/[id]` | 重组详情/审批 | restructure:read |
| **台账与对账** | | |
| `/ledger/loans` | 借款台账 | ledger:read |
| `/ledger/disbursements` | 放款台账 | ledger:read |
| `/ledger/repayments` | 还款台账 | ledger:read |
| `/ledger/funders` | 资金方台账 | ledger:read |
| `/ledger/customers` | 客户往来台账 | ledger:read |
| `/ledger/daily` | 日资金流水 | ledger:read |
| `/ledger/receivables` | 应收/实收/未收 | ledger:read |
| `/ledger/alerts` | 对账差异预警 | ledger:read |
| `/ledger/export` | 导出中心 | ledger:export |
| **风控预警** | | |
| `/risk/alerts` | 预警列表 | risk:read |
| `/risk/high-risk` | 高风险客户 | risk:read |
| **消息通知** | | |
| `/notifications` | 站内信 | notification:read |
| `/notifications/config` | 通知配置 | notification:manage |
| **系统管理** | | |
| `/users` | 用户管理 | user:read |
| `/users/new` | 新增用户 | user:create |
| `/users/[id]` | 用户详情 | user:read |
| `/roles` | 角色与权限 | role:read |
| `/audit-logs` | 审计日志 | audit:read |
| `/settings` | 系统设置 | settings:manage |
| `/settings/loan-fee` | 费率配置 | settings:manage |

---

### 3.2 客户端门户路由

| 路径 | 说明 |
|------|------|
| `/client` | 客户首页/工作台 |
| `/client/loans` | 我的借款记录 |
| `/client/loans/[id]` | 借款详情 |
| `/client/loans/new` | 发起借款申请 |
| `/client/repayment-plans` | 我的还款计划 |
| `/client/repayment-plans/[id]` | 计划详情(每期应还) |
| `/client/todo` | 待办中心 |
| `/client/todo/sign-contract/[id]` | 签署合同 |
| `/client/todo/confirm-receipt/[id]` | 确认收款 |
| `/client/todo/confirm-repayment/[id]` | 确认还款 |
| `/client/repayments/upload` | 上传还款凭证 |
| `/client/notifications` | 消息通知 |
| `/client/profile` | 个人设置 |

---

## 4. 客户端门户菜单

```
🏠 首页 / 工作台
│   ├── 待办提醒（待签合同/待确认收款/待确认还款）
│   ├── 当前在贷金额
│   └── 最近还款日
│
📋 我的借款
│   ├── 借款记录列表
│   ├── 借款详情
│   ├── 发起新借款申请
│   └── 当前应还 / 还款计划
│       ├── 每期明细（本金/利息/费用/罚息）
│       └── 剩余欠款
│
✅ 待办
│   ├── 待签署合同
│   │   └── 在线签署（手写签名 + 确认）
│   ├── 待确认收款
│   │   └── 确认已收到款项
│   └── 待确认还款
│       └── 确认还款金额与用途（手写签名）
│
💳 还款
│   ├── 去还款（引导至线下/第三方）
│   └── 上传还款凭证
│
🔔 消息通知
│   └── 站内信列表
│
⚙️ 个人设置
    ├── 修改手机号
    ├── 修改邮箱
    └── 修改密码
```

---

## 5. 信息架构要点

### 5.1 页面通用规范
- **列表页**：支持筛选（状态、时间范围、客户、金额区间）、分页、排序、导出 Excel
- **详情页**：主信息 + 时间线/审批流 + 关联数据 Tab + 操作按钮
- **所有金额展示**：清晰展示"应还/已还/剩余"，"各项费用明细"，**不隐藏任何费用**
- **操作按钮**：根据状态和角色动态显示可用操作

### 5.2 响应式设计要求
- **桌面端**：侧边栏菜单 + 内容区，宽表格、图表
- **移动端**：底部 Tab 导航（首页/借款/待办/还款/我的），卡片式列表
- **核心移动端流程**：签署合同、确认收款、确认还款、上传凭证 — 必须触摸友好
- **手写签名**：Canvas 支持触摸和鼠标，尺寸自适应

### 5.3 Dashboard 驾驶舱 — 13 项核心指标

| # | 指标 | 数据来源 | 展示方式 |
|---|------|---------|---------|
| 1 | 今日放款金额 | disbursements(paid_at=today) SUM | 数字卡片 |
| 2 | 今日收款金额 | repayments(confirmed, paid_at=today) SUM | 数字卡片 |
| 3 | 今日逾期金额 | overdue_records(active) SUM(overdue_fee) | 数字卡片(红色) |
| 4 | 在贷余额 | schedule_items(pending/partial/overdue) SUM(remaining) | 数字卡片 |
| 5 | 客户总数 | customers COUNT | 数字卡片 |
| 6 | 活跃借款客户数 | loan_applications(repaying) DISTINCT customer | 数字卡片 |
| 7 | 逾期率 | 逾期客户数 / 活跃借款客户数 × 100% | 百分比卡片 |
| 8 | 资金方余额 | fund_accounts SUM(balance) | 数字卡片 |
| 9 | 各资金方收益 | fund_profit_shares GROUP BY funder | 表格/柱状图 |
| 10 | 待确认还款 | repayments(pending_confirm) COUNT | 待办卡片(橙色) |
| 11 | 待签合同 | contracts(pending_sign) COUNT | 待办卡片 |
| 12 | 待放款单 | disbursements(pending) COUNT | 待办卡片 |
| 13 | 风险客户数 | customers(is_blacklist OR is_watchlist OR risk_tags非空) COUNT | 预警卡片(红色) |

### 5.4 不同角色的 Dashboard 差异

| 角色 | 可见指标 | 特殊待办 |
|------|---------|---------|
| 超级管理员/审计/老板 | 全部 13 项 | — |
| 业务员 | 客户数、己方客户借款、待签 | 我创建的待审核申请 |
| 风控 | 风险客户、逾期率、待风控 | 待风控审核列表 |
| 审批经理 | 待审批、今日放款、在贷余额 | 待审批列表 |
| 财务 | 今日放/收款、待放款、待确认还款 | 财务操作待办 |
| 资金方 | 己方余额、己方收益、己方对账 | — |
| 催收 | 逾期列表、逾期金额、逾期率 | 催收待办 |

以上为完整后台菜单结构与信息架构，可直接用于前端路由配置、权限控制与页面开发。
