import { prisma } from "@/lib/prisma";

/**
 * 资金方合同模板引擎
 * 根据合作模式自动生成合作协议
 */

const FIXED_MONTHLY_TEMPLATE = `
资金合作协议（固定月息模式）

甲方（平台方）：财大气粗总公司
乙方（资金方）：{{funderName}}
联系人：{{contactPerson}}
联系电话：{{contactPhone}}

签订日期：{{signDate}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

第一条 合作模式

本协议采用【固定月息】合作模式。甲方按乙方投入资金总额，以月利率 {{monthlyRate}}% 向乙方支付固定利息。

第二条 资金使用

1. 乙方将资金注入甲方指定的资金账户。
2. 甲方优先使用乙方资金进行贷款发放。
3. 甲方应确保资金用途合法合规，仅用于个人消费贷款发放。

第三条 利息计算与支付

1. 利息按自然月计算，每满30天为一个计息周期。
2. 月利率为 {{monthlyRate}}%，按投入总额计算。
3. 利息自资金实际到账之日起计算。
4. 满一个月后，乙方可申请提取利息或本息。

第四条 提前退出

1. 乙方可随时申请提前退出（取回本金）。
2. 提前退出的资金不计算利息。
3. 甲方应在收到申请后 {{cooldownDays}} 个工作日内完成本金退还。

第五条 风险分担

{{riskClause}}

第六条 保密条款

双方对本协议内容及合作过程中知悉的对方商业信息承担保密义务。

第七条 争议解决

本协议的签订、履行及争议解决适用中华人民共和国法律。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

甲方签章：_____________    乙方签章：_____________
日期：_____________         日期：_____________
`;

const VOLUME_BASED_TEMPLATE = `
资金合作协议（业务量结算模式）

甲方（平台方）：财大气粗总公司
乙方（资金方）：{{funderName}}
联系人：{{contactPerson}}
联系电话：{{contactPhone}}

签订日期：{{signDate}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

第一条 合作模式

本协议采用【业务量结算】合作模式。甲方仅按实际使用乙方资金发放贷款的金额，以7天为周期、周利率 {{weeklyRate}}% 向乙方支付利息。

第二条 资金使用

1. 乙方将资金注入甲方指定的资金账户。
2. 甲方根据业务需求使用乙方资金进行贷款发放。
3. 未被使用的闲置资金，乙方可随时申请提回，不影响已产生利息。

第三条 利息计算与支付

1. 利息仅按实际放出贷款金额计算。
2. 以7天（自然日）为一个计息周期，周利率 {{weeklyRate}}%。
3. 利息按周累计，每周可申请提取。
4. 未放出的闲置资金不计利息。

第四条 资金提取

1. 闲置资金：乙方可随时申请提回。
2. 已放出资金：需等待贷款回款或申请提前退出。
3. 利息提取：每满7天可提取一次已确认的利息。
4. 提现冷却期：两次提现之间至少间隔 {{cooldownDays}} 天。

第五条 风险分担

{{riskClause}}

第六条 保密条款

双方对本协议内容及合作过程中知悉的对方商业信息承担保密义务。

第七条 争议解决

本协议的签订、履行及争议解决适用中华人民共和国法律。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

甲方签章：_____________    乙方签章：_____________
日期：_____________         日期：_____________
`;

export class FunderContractService {
  /**
   * 根据资金方信息生成合同内容
   */
  static async generateContract(funderId: string, generatedBy?: string) {
    const funder = await prisma.funder.findUniqueOrThrow({
      where: { id: funderId },
    });

    const template =
      funder.cooperationMode === "FIXED_MONTHLY"
        ? FIXED_MONTHLY_TEMPLATE
        : VOLUME_BASED_TEMPLATE;

    const riskClause = funder.riskSharing
      ? `乙方参与风险分担。如借款人发生逾期或坏账，乙方按 ${(Number(funder.riskShareRatio) * 100).toFixed(1)}% 的比例承担损失，该损失金额从应付利息中扣除。`
      : "乙方不承担借款人逾期或坏账风险。甲方独立承担全部信用风险，确保按约定向乙方支付利息。";

    const content = template
      .replace(/\{\{funderName\}\}/g, funder.name)
      .replace(/\{\{contactPerson\}\}/g, funder.contactPerson ?? "")
      .replace(/\{\{contactPhone\}\}/g, funder.contactPhone ?? "")
      .replace(/\{\{monthlyRate\}\}/g, String(Number(funder.monthlyRate)))
      .replace(/\{\{weeklyRate\}\}/g, String(Number(funder.weeklyRate)))
      .replace(/\{\{cooldownDays\}\}/g, String(funder.withdrawalCooldownDays))
      .replace(/\{\{riskClause\}\}/g, riskClause)
      .replace(/\{\{signDate\}\}/g, new Date().toISOString().split("T")[0]);

    const title =
      funder.cooperationMode === "FIXED_MONTHLY"
        ? `资金合作协议（固定月息）— ${funder.name}`
        : `资金合作协议（业务量结算）— ${funder.name}`;

    return prisma.funderContract.create({
      data: {
        funderId: funder.id,
        cooperationMode: funder.cooperationMode,
        title,
        content,
        status: "DRAFT",
        generatedBy,
      },
    });
  }

  /**
   * 获取资金方合同列表
   */
  static async list(funderId: string) {
    return prisma.funderContract.findMany({
      where: { funderId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        cooperationMode: true,
        status: true,
        signedAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * 获取单个合同详情
   */
  static async get(contractId: string) {
    return prisma.funderContract.findUniqueOrThrow({
      where: { id: contractId },
    });
  }
}
