export const PROFESSIONAL_LOAN_TEMPLATE_CODE = "professional_loan_capitalized_interest_v1";

export const PROFESSIONAL_LOAN_TEMPLATE_VARIABLES = [
  "platform_name",
  "lender_name",
  "contract_no",
  "sign_date",
  "sign_time",
  "sign_location",
  "customer_name",
  "customer_id_number",
  "customer_phone",
  "application_no",
  "product_name",
  "term_value",
  "term_unit",
  "base_principal",
  "weekly_interest_amount",
  "monthly_interest_amount",
  "capitalized_interest_amount",
  "contract_principal",
  "contract_display_interest_rate",
  "contract_display_interest_note",
  "interest_rate",
  "service_fee",
  "total_repay",
  "repay_schedule_summary",
  "disbursement_amount",
  "legal_service_basis",
  "dispute_resolution_court",
] as const;

export const PROFESSIONAL_LOAN_TEMPLATE_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>借款合同</title>
    <style>
      body {
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
        color: #0f172a;
        line-height: 1.75;
        padding: 32px;
      }
      h1, h2, h3 {
        margin: 0;
      }
      h1 {
        text-align: center;
        font-size: 28px;
        margin-bottom: 8px;
      }
      .subhead {
        text-align: center;
        color: #475569;
        margin-bottom: 24px;
      }
      .block {
        margin-bottom: 18px;
      }
      .table {
        width: 100%;
        border-collapse: collapse;
        margin: 14px 0 20px;
      }
      .table th,
      .table td {
        border: 1px solid #cbd5e1;
        padding: 10px 12px;
        vertical-align: top;
      }
      .table th {
        background: #f8fafc;
        width: 22%;
        text-align: left;
      }
      .section-title {
        font-size: 18px;
        margin: 24px 0 10px;
      }
      .signature {
        margin-top: 40px;
      }
      .signature-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
      }
      .muted {
        color: #475569;
      }
      .notice {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        padding: 14px 16px;
      }
    </style>
  </head>
  <body>
    <h1>借款合同</h1>
    <div class="subhead">合同编号：{{ contract_no }}</div>

    <div class="block">
      甲方（出借方）：{{ lender_name }}<br />
      平台/居间服务方：{{ platform_name }}<br />
      乙方（借款人）：{{ customer_name }}<br />
      证件号码：{{ customer_id_number }}<br />
      联系电话：{{ customer_phone }}
    </div>

    <div class="notice">
      乙方确认：本合同中的“基础本金”“并入本金收益”“合同本金”“法律服务费”均已在签署前由系统展示并由乙方逐项确认。
      如存在收益并入本金安排，则以本合同列明的金额为准，并作为后续还款、争议处理及证据固定的依据。
    </div>

    <h2 class="section-title">一、借款核心信息</h2>
    <table class="table">
      <tr>
        <th>申请编号</th>
        <td>{{ application_no }}</td>
        <th>产品名称</th>
        <td>{{ product_name }}</td>
      </tr>
      <tr>
        <th>基础本金</th>
        <td>{{ base_principal }}</td>
        <th>借款期限</th>
        <td>{{ term_value }} {{ term_unit }}</td>
      </tr>
      <tr>
        <th>每周正常利息</th>
        <td>{{ weekly_interest_amount }}</td>
        <th>每月累计正常利息</th>
        <td>{{ monthly_interest_amount }}</td>
      </tr>
      <tr>
        <th>并入本金的正常利息</th>
        <td>{{ capitalized_interest_amount }}</td>
        <th>合同本金</th>
        <td>{{ contract_principal }}</td>
      </tr>
      <tr>
        <th>合同列示利率</th>
        <td>{{ contract_display_interest_rate }}</td>
        <th>列示说明</th>
        <td>{{ contract_display_interest_note }}</td>
      </tr>
      <tr>
        <th>放款金额</th>
        <td>{{ disbursement_amount }}</td>
        <th>还款摘要</th>
        <td>{{ repay_schedule_summary }}</td>
      </tr>
    </table>

    <h2 class="section-title">二、收益并入本金约定</h2>
    <div class="block">
      1. 双方确认，本合同项下的合同本金由“基础本金 + 并入本金收益”组成，即：合同本金 = {{ base_principal }} + {{ capitalized_interest_amount }} = {{ contract_principal }}。
    </div>
    <div class="block">
      2. 如双方另行约定按周收益或按月累计收益计入合同本金，则乙方确认该并入金额已经在签署页充分展示，乙方知悉其将进入后续应还本金口径并作为合同主债权的一部分。
    </div>
    <div class="block">
      3. 若你示例中的业务口径为“基础本金 10000 欧元，每月累计收益 2000 欧元，并入后合同本金为 12000 欧元”，系统应填写“基础本金=10000”“并入本金收益=2000”“合同本金=12000”。
      若基础本金实际为 1000 欧元，则合同本金不应直接写为 12000 欧元，需由业务方先确认正确计算口径后再生成正式合同。
    </div>

    <h2 class="section-title">三、合同列示利率说明</h2>
    <div class="block">
      1. 双方确认，正常业务利息已按约定并入合同本金，即本合同中的合同本金已经包含双方确认的正常利息口径。
    </div>
    <div class="block">
      2. 本合同另行列示 {{ contract_display_interest_rate }} 的合同展示利率，该利率仅用于合同文本展示、法律依据及争议处理时的条款表述，不作为系统正常利息的重复计算依据。
    </div>
    <div class="block">
      3. 乙方确认：系统实际的正常利息、逾期费用、展期费用、重组费用及还款金额，仍以平台页面、还款计划和双方确认记录为准；本条列示的 2% 不会再叠加生成一笔新的正常利息。
    </div>

    <h2 class="section-title">四、放款与还款</h2>
    <div class="block">
      1. 甲方或甲方指定付款主体向乙方支付的实际放款金额为 {{ disbursement_amount }}。
    </div>
    <div class="block">
      2. 乙方应按本合同、系统展示的还款计划及经双方确认的还款节点履行还款义务。系统页面中的还款确认、逾期费用提示、到账确认记录，可作为本合同履行过程中的电子证据。
    </div>
    <div class="block">
      3. 若乙方仅支付利息、费用或部分金额，而未清偿对应本金，则未清偿本金部分继续按约定规则计算后续收益、费用或逾期责任，直至实际清偿为止。
    </div>

    <h2 class="section-title">五、声明与承诺</h2>
    <div class="block">
      1. 乙方确认已完整阅读本合同全部条款，已充分理解收益并入本金、法律服务费、逾期费用、提前回款、外部通知及电子签名条款的法律后果。
    </div>
    <div class="block">
      2. 乙方同意平台通过站内消息、短信、WhatsApp、邮件等方式发送合同、放款、还款、逾期、回款及风控通知，该等通知可以作为履约提醒与证据留存的一部分。
    </div>
    <div class="block">
      3. 乙方确认其在本合同签署页完成的电子签名、移动端确认、设备信息、IP 地址、时间戳、操作日志等均可作为认定其签约意愿及履约事实的证据。
    </div>

    <h2 class="section-title">六、争议解决</h2>
    <div class="block">
      凡因本合同引起或与本合同有关的一切争议，双方应先行协商；协商不成的，任何一方可向 {{ dispute_resolution_court }} 提起诉讼。
    </div>

    <div class="signature">
      <div class="muted">签署日期：{{ sign_date }} {{ sign_time }}，签署地点：{{ sign_location }}</div>
      <div class="signature-grid">
        <div>
          <div>甲方（出借方）：{{ lender_name }}</div>
          <div style="margin-top: 48px;">签署：__________________</div>
        </div>
        <div>
          <div>乙方（借款人）：{{ customer_name }}</div>
          <div style="margin-top: 18px;">电子签名位置：</div>
          <div style="height: 96px; border: 1px dashed #94a3b8; margin-top: 10px;"></div>
        </div>
      </div>
    </div>
  </body>
</html>
`.trim();
