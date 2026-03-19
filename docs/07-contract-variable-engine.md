# 合同变量引擎设计

## 1. 目标
- 合同模板使用占位符（变量），签署前用业务数据替换，生成最终 HTML/PDF。
- 变量可校验、版本化；历史合同保留变量快照，不受新规则篡改。

## 2. 变量约定
- 语法：`{{variableName}}` 或 `{{ variableName }}`。
- 变量名：小写+下划线，如 `customer_name`、`loan_amount`、`sign_date`。

## 3. 标准变量清单（借款合同）

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| customer_name | 借款人姓名 | 张三 |
| customer_id_number | 证件号 | 310*** |
| customer_phone | 手机 | 138**** |
| loan_amount | 借款金额（欧元） | 100,000.00 |
| loan_amount_cn | 借款金额大写 | 壹拾万欧元整 |
| term_value | 期限数值 | 12 |
| term_unit | 期限单位 | 月 |
| interest_rate | 年化利率 | 10.5% |
| service_fee | 服务费 | 1,000.00 |
| total_repay | 应还总额 | 111,000.00 |
| repay_schedule_summary | 还款计划摘要（文字） | 共12期，每月还… |
| sign_date | 签约日期 | 2025-03-17 |
| sign_time | 签约时间 | 14:30:00 |
| sign_location | 签约地点 | 上海市 |
| contract_no | 合同编号 | HT202503170001 |

## 4. 引擎职责
1. **解析模板**：从 HTML 中提取所有 `{{ xxx }}`，得到变量列表。
2. **校验**：根据 variables_schema 校验必填、类型、格式。
3. **填充**：用上下文对象替换占位符；未知变量可保留原样或置空。
4. **快照**：生成合同时将变量快照存入 `contract.variables_snapshot`（JSON）。

## 5. 与业务联动
- 生成合同时由「借款申请 + 产品 + 定价规则」计算得到金额、利率、应还等，再映射为变量对象。
- 签署时记录 sign_date/sign_time/sign_location（可从请求 IP/前端传参获取），再次替换或仅写入 signatures 表。

## 6. 安全与合规
- 禁止在模板中执行脚本；仅做字符串替换。
- 敏感字段（如证件号）可按配置脱敏后再写入快照或 PDF。
