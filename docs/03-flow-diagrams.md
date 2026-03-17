# 借款业务管理系统 - 五大核心流程图

## 流程1：借款申请 → 风控 → 审批 → 合同 → 签字 → 放款 → 客户确认收款 → 还款计划

```mermaid
flowchart TB
    Start([客户/业务员发起借款申请]) --> A[创建借款申请 draft]
    A --> A1[选择产品、金额、期限、用途]
    A1 --> A2[费用试算 规则引擎]
    A2 --> Submit{提交?}
    Submit -->|是| B[状态: pending_risk]
    Submit -->|否| A

    B --> Risk[风控审核]
    Risk --> RiskR{风控结果}
    RiskR -->|驳回| Reject1[状态: risk_rejected]
    RiskR -->|通过| C[状态: pending_approval]

    C --> Approve[审批流 可多级]
    Approve --> ApproveR{审批结果}
    ApproveR -->|驳回/退回| Reject2[状态: rejected / 退回补件]
    ApproveR -->|通过| D[状态: approved]

    D --> GenContract[生成合同 模板+变量]
    GenContract --> E[合同状态: pending_sign]
    E --> Sign[客户在线签署]
    Sign --> SignRecord[记录签字/勾选/验证码/IP/设备/时间]
    SignRecord --> F[合同状态: signed]

    F --> CreateDisb[生成放款单]
    CreateDisb --> G[放款单: pending]
    G --> Pay[财务打款 记录账户/凭证/操作人]
    Pay --> H[放款单: paid]

    H --> NotifyCust[通知客户]
    NotifyCust --> CustConfirm{客户确认收款?}
    CustConfirm -->|确认已收款| I[放款单: confirmed]
    CustConfirm -->|超时/争议| Manual1[人工跟进]

    I --> GenPlan[生成还款计划]
    GenPlan --> J[还款计划 + 计划明细]
    J --> End1([流程结束 进入还款阶段])
```

---

## 流程2：客户还款 → 财务登记 → 凭证 → 匹配 → 客户确认 → 核销 → 更新欠款

```mermaid
flowchart TB
    Start([客户还款 或 代付入账]) --> A[财务登记还款]
    A --> A1[录入金额、到账时间、方式]
    A1 --> A2[上传还款凭证]
    A2 --> B[创建还款单 status: registered]

    B --> Match[系统匹配借款/期次]
    Match --> MatchR{匹配结果}
    MatchR -->|唯一匹配| C[status: matched]
    MatchR -->|多笔/争议| C2[status: manual_review]

    C --> Alloc[生成分配方案 本金/利息/费用/罚息]
    Alloc --> D[status: pending_confirm]

    D --> Notify[通知客户确认]
    Notify --> CustConfirm{客户确认}
    CustConfirm -->|确认金额与用途| E[客户确认记录]
    CustConfirm -->|驳回| F[status: rejected 人工复核]

    E --> E1[repayment status: confirmed]
    E1 --> WriteOff[核销入账]
    WriteOff --> G[更新 schedule_item 已还金额]
    G --> H[更新 plan 与 剩余欠款]
    H --> Ledger[写入台账 ledger_entries]
    Ledger --> End1([还款入账完成])

    C2 --> Manual[人工指定借款/期次]
    Manual --> Alloc
    F --> Manual
```

---

## 流程3：逾期 → 罚息计算 → 提醒 → 展期/分期重组 → 补充协议 → 新计划生效

```mermaid
flowchart TB
    Start([还款计划存在未还期次]) --> Check[定时/实时检查到期日]
    Check --> Overdue{是否逾期?}
    Overdue -->|否| Check
    Overdue -->|是| A[创建/更新 overdue_records]

    A --> Calc[规则引擎 计算逾期罚息/违约金]
    Calc --> B[更新 schedule_item 或 生成逾期费用项]
    B --> Remind[逾期提醒 按配置频率]
    Remind --> RemindCh[短信/邮件/站内信/WhatsApp]

    RemindCh --> ClientChoice{客户选择}
    ClientChoice -->|正常还款| Pay[走流程2 还款登记与确认]
    ClientChoice -->|申请展期| Ext[展期申请]
    ClientChoice -->|申请分期重组| Rest[分期重组申请]

    Ext --> ExtApprove{展期审批}
    ExtApprove -->|通过| ExtFee[计算展期费 规则引擎]
    ExtFee --> Supp1[生成补充协议]
    Supp1 --> Sign1[客户签署补充协议]
    Sign1 --> NewDue1[调整到期日/新计划版本]
    NewDue1 --> End1([展期生效])

    Rest --> RestApprove{重组审批}
    RestApprove -->|通过| NewPlan[生成新还款计划 版本+1]
    NewPlan --> Supp2[生成补充协议]
    Supp2 --> Sign2[客户签署]
    Sign2 --> OldPlan[原计划 status: superseded]
    OldPlan --> End2([重组生效])

    ExtApprove -->|驳回| End3([保持逾期状态])
    RestApprove -->|驳回| End3
```

---

## 流程4：资金方入金 → 资金池 → 分配到放款 → 收益统计 → 对账单

```mermaid
flowchart TB
    Start([资金方划款到指定账户]) --> A[登记入金]
    A --> A1[选择资金方/资金账户]
    A1 --> A2[录入金额、时间、凭证]
    A2 --> B[capital_inflows 入金记录]

    B --> C[更新 fund_accounts.balance]
    C --> D[写入 ledger_entries 类型: inflow]

    D --> Pool[资金池/账户余额可用]

    Pool --> Disb[放款时选择资金来源]
    Disb --> E[disbursements 关联 fund_account_id]
    E --> E1[扣减 fund_account 余额]
    E1 --> E2[ledger_entries 类型: disbursement]

    E2 --> F[资金使用去向 可追溯到每笔放款]

    F --> Repay[客户还款]
    Repay --> G[还款按规则分配 本金/利息/费用]
    G --> H[资金方收益统计 利息+费用分润]
    H --> I[收益写入/汇总]

    I --> J[资金方对账单]
    J --> J1[入金合计、出金合计、收益、余额]
    J1 --> Export[导出 Excel/PDF]
    Export --> End([对账完成])
```

---

## 流程5：展期详细子流程（含状态与规则）

```mermaid
stateDiagram-v2
    [*] --> 客户申请展期
    客户申请展期 --> 展期单创建: 创建 extensions
    展期单创建 --> 待审批: status=pending

    待审批 --> 审批通过: approver 通过
    待审批 --> 审批驳回: approver 驳回

    审批通过 --> 计算展期费: 规则引擎 extension_fee
    计算展期费 --> 生成补充协议: 合同模板 展期条款
    生成补充协议 --> 待客户签署: contract pending_sign
    待客户签署 --> 已签署: 客户签字+留痕
    已签署 --> 更新计划: 新到期日/新费用项
    更新计划 --> 生效: status=effective

    审批驳回 --> [*]
    生效 --> [*]
```

---

## 状态机汇总（关键实体）

| 实体 | 状态流转 |
|------|----------|
| loan_application | draft → pending_risk → (risk_rejected \| pending_approval) → (rejected \| approved) → contracted → disbursed |
| contract | draft → pending_sign → signed \| cancelled |
| disbursement | pending → paid → confirmed \| cancelled |
| repayment | registered → matched → pending_confirm → (confirmed \| rejected \| manual_review) |
| repayment_plan | active → superseded \| completed |

以上流程图与状态机用于开发实现与测试用例设计。
