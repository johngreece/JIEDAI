const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const defaultRates = {
  sameDayRate: 2,
  nextDayRate: 3,
  day3Day7Rate: 5,
  otherDayRate: 5,
  overdueGraceHours: 24,
  overdueRatePerDayBefore14: 1,
  overdueRatePerDayAfter14: 2,
};

const feeKeys = {
  sameDayRate: "loan_fee_same_day_rate",
  nextDayRate: "loan_fee_next_day_rate",
  day3Day7Rate: "loan_fee_day3_day7_rate",
  otherDayRate: "loan_fee_other_day_rate",
  overdueGraceHours: "loan_overdue_grace_hours",
  overdueRateBefore14: "loan_overdue_rate_per_day_before_14",
  overdueRateAfter14: "loan_overdue_rate_per_day_after_14",
};

const defaultContractHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>借款合同</title></head>
<body style="font-family: sans-serif; padding: 20px;">
  <h2>借款合同</h2>
  <p>合同编号：{{ contract_no }}</p>
  <p>甲方（出借人）：【系统配置】</p>
  <p>乙方（借款人）：{{ customer_name }}</p>
  <p>证件号：{{ customer_id_number }}</p>
  <p>联系电话：{{ customer_phone }}</p>
  <p>借款金额：{{ loan_amount }} 元（大写：{{ loan_amount_cn }}）</p>
  <p>借款期限：{{ term_value }}{{ term_unit }}</p>
  <p>利率/费用：{{ interest_rate }}；服务费：{{ service_fee }}</p>
  <p>应还总额：{{ total_repay }}</p>
  <p>还款概要：{{ repay_schedule_summary }}</p>
  <p>签署日期：{{ sign_date }} {{ sign_time }} {{ sign_location }}</p>
  <p>乙方确认已阅读并同意上述条款，自愿签署本合同。</p>
</body></html>
`;

async function main() {
  const template = await prisma.contractTemplate.upsert({
    where: { templateCode: "default_loan" },
    create: {
      templateCode: "default_loan",
      name: "默认借款合同模板",
      contentHtml: defaultContractHtml.trim(),
      version: 1,
      isActive: true,
      effectiveFrom: new Date(),
    },
    update: {},
  });
  console.log("ContractTemplate:", template.id);

  for (const [key, settingKey] of Object.entries(feeKeys)) {
    const value = defaultRates[key];
    await prisma.systemSetting.upsert({
      where: { key: settingKey },
      create: { key: settingKey, value: { value }, category: "loan_fee", description: key },
      update: {},
    });
  }
  console.log("Loan fee system_settings seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
