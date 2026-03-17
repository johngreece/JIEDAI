import { prisma } from "@/lib/prisma";
import { ServiceResponse } from "@/types";

type ContractRecord = NonNullable<Awaited<ReturnType<typeof prisma.contract.findFirst>>>;

export class ContractService {
  /**
   * 生成合同编号
   * 格式: HT + 时间戳36进制 + 随机数4位
   */
  private static generateContractNo(): string {
    return "HT" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  /**
   * 获取借款申请关联的合同
   */
  static async getContractsByApplication(applicationId: string): Promise<ContractRecord[]> {
    return prisma.contract.findMany({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * 为审批通过的申请生成主合同
   */
  static async generateMainContract(applicationId: string): Promise<ServiceResponse<ContractRecord>> {
    // 1. 验证申请状态
    const application = await prisma.loanApplication.findUnique({
      where: { id: applicationId },
      include: { customer: true, product: true },
    });

    if (!application) {
      return { success: false, error: "借款申请不存在" };
    }

    if (application.status !== "APPROVED") {
      return { success: false, error: "只有审批通过的申请才能生成合同" };
    }

    // 2. 检查是否已存在主合同
    const existing = await prisma.contract.findFirst({
      where: { applicationId, contractType: "MAIN" },
    });

    if (existing) {
      return { success: false, error: "主合同已存在", data: existing };
    }

    // 3. 获取最新启用的合同模板
    const template = await prisma.contractTemplate.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!template) {
      return { success: false, error: "系统未配置有效的合同模板" };
    }

    // 4. 生成合同记录
    try {
      const contract = await prisma.contract.create({
        data: {
          contractNo: this.generateContractNo(),
          contractType: "MAIN",
          templateId: template.id,
          content: template.content, // 初始直接使用模板内容，后续签名时填充变量
          status: "DRAFT", // 初始为草稿状态
          applicationId: application.id,
          customerId: application.customerId,
          variableData: JSON.stringify({
            customerName: application.customer.name,
            amount: Number(application.amount),
            termValue: application.termValue,
            termUnit: application.termUnit,
          }),
        },
      });

      return { success: true, data: contract };
    } catch (error) {
      console.error("生成合同失败:", error);
      return { success: false, error: "数据库操作失败" };
    }
  }

  /**
   * 确认合同签署 (通常由客户操作)
   */
  static async signContract(contractId: string): Promise<ServiceResponse<ContractRecord>> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
    });

    if (!contract) return { success: false, error: "合同不存在" };
    if (contract.status !== "DRAFT") return { success: false, error: "合同状态不正确" };

    const updated = await prisma.contract.update({
      where: { id: contractId },
      data: {
        status: "SIGNED",
        signedAt: new Date(),
      },
    });

    // 更新申请状态为待放款 (如果这是主合同)
    if (contract.contractType === "MAIN") {
        await prisma.loanApplication.update({
            where: { id: contract.applicationId },
            data: { status: "CONTRACTED" }
        })
    }

    return { success: true, data: updated };
  }
}