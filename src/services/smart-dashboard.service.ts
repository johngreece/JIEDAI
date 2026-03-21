import { prisma } from "@/lib/prisma";

type SmartTodoUrgency = "critical" | "high" | "medium" | "low";

function toNumber(value: unknown) {
  return Number(value || 0);
}

function startOfDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function diffInDays(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function scoreLabel(score: number) {
  if (score >= 85) return "健康";
  if (score >= 70) return "稳定";
  if (score >= 55) return "注意";
  return "高风险";
}

function pressureLabel(coverageRatio: number) {
  if (coverageRatio >= 2) return "宽松";
  if (coverageRatio >= 1.2) return "可控";
  if (coverageRatio >= 1) return "偏紧";
  return "承压";
}

export class SmartDashboardService {
  static async getSmartData() {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    const in3Days = addDays(today, 3);
    const in7Days = addDays(today, 7);
    const in30Days = addDays(today, 30);
    const day30Ago = addDays(today, -30);
    const day3Ago = addDays(today, -3);
    const day2Ago = addDays(today, -2);
    const day1Ago = addDays(today, -1);

    const [
      dueTodayItems,
      due3DayItems,
      due7DayItems,
      activePlanItems30d,
      overdueRecords,
      customersByRisk,
      customersWithLoans,
      totalCustomers,
      pendingApplications,
      pendingContracts,
      pendingDisbursements,
      pendingRepayments,
      recentNewCustomers,
      repaymentPerformance,
      overdueHistory,
      fundBalanceAgg,
      pendingKycCount,
      expiredKycCount,
      expiringSoonKycCount,
      pendingExtensions,
      pendingRestructures,
    ] = await Promise.all([
      prisma.repaymentScheduleItem.findMany({
        where: {
          status: { in: ["PENDING", "PARTIAL"] },
          dueDate: { gte: today, lt: tomorrow },
        },
        select: {
          id: true,
          planId: true,
          periodNumber: true,
          dueDate: true,
          totalDue: true,
          remaining: true,
          plan: {
            select: {
              applicationId: true,
              planNo: true,
            },
          },
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.repaymentScheduleItem.findMany({
        where: {
          status: { in: ["PENDING", "PARTIAL"] },
          dueDate: { gte: tomorrow, lt: in3Days },
        },
        select: {
          id: true,
          planId: true,
          periodNumber: true,
          dueDate: true,
          totalDue: true,
          remaining: true,
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.repaymentScheduleItem.findMany({
        where: {
          status: { in: ["PENDING", "PARTIAL"] },
          dueDate: { gte: in3Days, lt: in7Days },
        },
        select: {
          id: true,
          planId: true,
          periodNumber: true,
          dueDate: true,
          totalDue: true,
          remaining: true,
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.repaymentScheduleItem.findMany({
        where: {
          status: { in: ["PENDING", "PARTIAL"] },
          dueDate: { gte: today, lt: in30Days },
        },
        select: {
          id: true,
          dueDate: true,
          totalDue: true,
          remaining: true,
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.overdueRecord.findMany({
        where: { status: "OVERDUE" },
        select: {
          id: true,
          overdueAmount: true,
          penaltyAmount: true,
          overdueDays: true,
          createdAt: true,
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              riskLevel: true,
            },
          },
        },
        orderBy: { overdueDays: "desc" },
      }),
      prisma.customer.groupBy({
        by: ["riskLevel"],
        where: { deletedAt: null },
        _count: true,
      }),
      prisma.customer.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          phone: true,
          riskLevel: true,
          createdAt: true,
          kyc: {
            select: {
              status: true,
              expiresAt: true,
            },
          },
          loanApplications: {
            where: { deletedAt: null },
            select: {
              id: true,
              amount: true,
              status: true,
              riskScore: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
          overdueRecords: {
            select: {
              status: true,
              overdueDays: true,
              overdueAmount: true,
            },
          },
        },
      }),
      prisma.customer.count({ where: { deletedAt: null } }),
      prisma.loanApplication.findMany({
        where: {
          status: { in: ["SUBMITTED", "PENDING_RISK", "PENDING_APPROVAL"] },
          deletedAt: null,
        },
        select: {
          id: true,
          applicationNo: true,
          amount: true,
          status: true,
          riskScore: true,
          createdAt: true,
          customer: {
            select: {
              name: true,
              phone: true,
              riskLevel: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 30,
      }),
      prisma.contract.findMany({
        where: { status: { in: ["DRAFT", "PENDING_SIGN"] } },
        select: {
          id: true,
          contractNo: true,
          createdAt: true,
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 30,
      }),
      prisma.disbursement.findMany({
        where: { status: "PENDING" },
        select: {
          id: true,
          disbursementNo: true,
          amount: true,
          createdAt: true,
          application: {
            select: {
              applicationNo: true,
              customer: {
                select: {
                  name: true,
                  phone: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 30,
      }),
      prisma.repayment.findMany({
        where: { status: "PENDING" },
        select: {
          id: true,
          repaymentNo: true,
          amount: true,
          receivedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 30,
      }),
      prisma.customer.findMany({
        where: {
          deletedAt: null,
          createdAt: { gte: day30Ago },
        },
        select: {
          createdAt: true,
        },
      }),
      prisma.repaymentScheduleItem.groupBy({
        by: ["status"],
        _count: true,
      }),
      prisma.overdueRecord.findMany({
        where: { createdAt: { gte: day30Ago } },
        select: {
          createdAt: true,
          overdueAmount: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.fundAccount.aggregate({
        where: { isActive: true },
        _sum: { balance: true },
      }),
      prisma.customerKyc.count({
        where: { status: "PENDING" },
      }),
      prisma.customerKyc.count({
        where: {
          OR: [
            { status: "EXPIRED" },
            { expiresAt: { lt: today } },
          ],
        },
      }),
      prisma.customerKyc.count({
        where: {
          expiresAt: { gte: today, lt: in30Days },
        },
      }),
      prisma.extension.count({
        where: { status: "PENDING" },
      }),
      prisma.restructure.count({
        where: { status: "PENDING" },
      }),
    ]);

    const mapAlertItem = (
      item: {
        id: string;
        planId: string;
        periodNumber: number;
        dueDate: Date;
        totalDue: unknown;
        remaining: unknown;
      }
    ) => ({
      id: item.id,
      planId: item.planId,
      periodNumber: item.periodNumber,
      dueDate: item.dueDate,
      amount: toNumber(item.remaining || item.totalDue),
    });

    const dueTodayTotal = dueTodayItems.reduce((sum, item) => sum + toNumber(item.remaining || item.totalDue), 0);
    const due3DayTotal = due3DayItems.reduce((sum, item) => sum + toNumber(item.remaining || item.totalDue), 0);
    const due7DayTotal = due7DayItems.reduce((sum, item) => sum + toNumber(item.remaining || item.totalDue), 0);
    const upcomingDue30d = activePlanItems30d.reduce((sum, item) => sum + toNumber(item.remaining || item.totalDue), 0);

    const mildOverdue = overdueRecords.filter((record) => record.overdueDays <= 7);
    const moderateOverdue = overdueRecords.filter((record) => record.overdueDays > 7 && record.overdueDays <= 14);
    const severeOverdue = overdueRecords.filter((record) => record.overdueDays > 14);
    const overdueTotal = overdueRecords.reduce((sum, record) => sum + toNumber(record.overdueAmount), 0);
    const penaltyTotal = overdueRecords.reduce((sum, record) => sum + toNumber(record.penaltyAmount), 0);

    const overdueByCustomer = new Map<
      string,
      {
        customerId: string;
        name: string;
        phone: string;
        riskLevel: string;
        totalAmount: number;
        totalPenalty: number;
        maxDays: number;
        count: number;
      }
    >();

    overdueRecords.forEach((record) => {
      const customer = record.customer;
      if (!customer) return;

      const current = overdueByCustomer.get(customer.id) || {
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone || "",
        riskLevel: customer.riskLevel,
        totalAmount: 0,
        totalPenalty: 0,
        maxDays: 0,
        count: 0,
      };

      current.totalAmount += toNumber(record.overdueAmount);
      current.totalPenalty += toNumber(record.penaltyAmount);
      current.maxDays = Math.max(current.maxDays, record.overdueDays);
      current.count += 1;

      overdueByCustomer.set(customer.id, current);
    });

    const topOverdueCustomers = Array.from(overdueByCustomer.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10);

    const customerProfiles = customersWithLoans.map((customer) => {
      const loans = customer.loanApplications;
      const overdueItems = customer.overdueRecords;
      const kycItems = customer.kyc;
      const totalLoans = loans.length;
      const activeLoans = loans.filter((loan) => loan.status === "DISBURSED").length;
      const settledLoans = loans.filter((loan) => ["SETTLED", "COMPLETED"].includes(loan.status)).length;
      const rejectedLoans = loans.filter((loan) => loan.status === "REJECTED").length;
      const totalBorrowed = loans.reduce((sum, loan) => sum + toNumber(loan.amount), 0);
      const activeOverdueCount = overdueItems.filter((item) => item.status === "OVERDUE").length;
      const highestRiskScore = loans.reduce((max, loan) => Math.max(max, toNumber(loan.riskScore)), 0);
      const hasPendingKyc = kycItems.some((item) => item.status === "PENDING");
      const hasExpiredKyc = kycItems.some(
        (item) => item.status === "EXPIRED" || (item.expiresAt ? item.expiresAt < today : false)
      );

      let valueTier = "新客户";
      if (totalLoans === 0) valueTier = "潜在客户";
      else if (settledLoans >= 3 && activeOverdueCount === 0) valueTier = "优质客户";
      else if (settledLoans >= 1 && activeOverdueCount === 0) valueTier = "良好客户";
      else if (activeLoans > 0 && activeOverdueCount === 0) valueTier = "正常客户";
      else if (activeOverdueCount > 0) valueTier = "风险客户";
      else if (rejectedLoans > 0 && totalLoans === rejectedLoans) valueTier = "拒绝客户";

      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        riskLevel: customer.riskLevel,
        valueTier,
        totalLoans,
        activeLoans,
        settledLoans,
        totalBorrowed,
        overdueCount: activeOverdueCount,
        highestRiskScore,
        hasPendingKyc,
        hasExpiredKyc,
        lastActivity: loans[0]?.createdAt || customer.createdAt,
      };
    });

    const valueTierDistribution: Record<string, number> = {};
    customerProfiles.forEach((profile) => {
      valueTierDistribution[profile.valueTier] = (valueTierDistribution[profile.valueTier] || 0) + 1;
    });

    const riskDistribution: Record<string, number> = {};
    customersByRisk.forEach((item) => {
      riskDistribution[item.riskLevel || "NORMAL"] = item._count;
    });

    const topBorrowers = [...customerProfiles]
      .filter((profile) => profile.totalLoans > 0)
      .sort((a, b) => b.totalBorrowed - a.totalBorrowed)
      .slice(0, 5);

    const riskCustomers = [...customerProfiles]
      .filter((profile) => profile.overdueCount > 0 || profile.hasExpiredKyc)
      .sort((a, b) => {
        if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
        return b.highestRiskScore - a.highestRiskScore;
      })
      .slice(0, 5);

    const potentialReborrow = [...customerProfiles]
      .filter((profile) => profile.settledLoans > 0 && profile.activeLoans === 0 && profile.overdueCount === 0)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
      .slice(0, 5);

    const customerGrowthTrend = [0, 0, 0, 0];
    recentNewCustomers.forEach((customer) => {
      const days = diffInDays(customer.createdAt, now);
      const bucket = Math.min(3, Math.floor(days / 7));
      customerGrowthTrend[3 - bucket] += 1;
    });

    const totalScheduleItems = repaymentPerformance.reduce((sum, item) => sum + item._count, 0);
    const paidCount = repaymentPerformance.find((item) => item.status === "PAID")?._count || 0;
    const overdueItemCount = repaymentPerformance.find((item) => item.status === "OVERDUE")?._count || 0;
    const onTimeRate = totalScheduleItems > 0 ? Math.round((paidCount / totalScheduleItems) * 1000) / 10 : 0;
    const overdueRate = totalScheduleItems > 0 ? Math.round((overdueItemCount / totalScheduleItems) * 1000) / 10 : 0;

    const overdueWeekTrend = [0, 0, 0, 0];
    overdueHistory.forEach((record) => {
      const days = diffInDays(record.createdAt, now);
      const bucket = Math.min(3, Math.floor(days / 7));
      overdueWeekTrend[3 - bucket] += 1;
    });

    const pendingApplicationOldCount = pendingApplications.filter((item) => item.createdAt < day3Ago).length;
    const pendingContractOldCount = pendingContracts.filter((item) => item.createdAt < day2Ago).length;
    const pendingDisbursementOldCount = pendingDisbursements.filter((item) => item.createdAt < day1Ago).length;
    const pendingRepaymentOldCount = pendingRepayments.filter((item) => item.createdAt < day1Ago).length;

    const highRiskApplicationCount = pendingApplications.filter((item) => toNumber(item.riskScore) >= 70).length;
    const pendingDisbursementAmount = pendingDisbursements.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const pendingRepaymentAmount = pendingRepayments.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const fundBalance = toNumber(fundBalanceAgg._sum.balance);
    const expectedCollections7d = dueTodayTotal + due3DayTotal + due7DayTotal;
    const predictedNetInflow7d = expectedCollections7d - pendingDisbursementAmount;
    const coverageRatio =
      pendingDisbursementAmount > 0
        ? Number(((fundBalance + expectedCollections7d) / pendingDisbursementAmount).toFixed(2))
        : 9.99;

    const collectionScore = clamp(100 - severeOverdue.length * 12 - moderateOverdue.length * 6 - mildOverdue.length * 2 - overdueRate);
    const liquidityScore = clamp(
      coverageRatio >= 2 ? 92 : coverageRatio >= 1.2 ? 76 : coverageRatio >= 1 ? 58 : 32
    );
    const complianceScore = clamp(100 - expiredKycCount * 12 - pendingKycCount * 3 - expiringSoonKycCount * 2);
    const operationsScore = clamp(
      100 -
        pendingApplicationOldCount * 8 -
        pendingContractOldCount * 5 -
        pendingDisbursementOldCount * 6 -
        pendingRepaymentOldCount * 4
    );
    const portfolioScore = clamp(
      100 -
        (riskDistribution.HIGH || 0) * 10 -
        riskCustomers.length * 6 -
        highRiskApplicationCount * 5
    );

    const riskRadar = [
      {
        key: "collection",
        label: "回款表现",
        score: collectionScore,
        status: scoreLabel(collectionScore),
        summary: `${overdueRecords.length} 笔逾期，严重逾期 ${severeOverdue.length} 笔`,
      },
      {
        key: "liquidity",
        label: "资金流动性",
        score: liquidityScore,
        status: scoreLabel(liquidityScore),
        summary: `覆盖率 ${coverageRatio.toFixed(2)}x，待放款 ${pendingDisbursementAmount.toFixed(0)}`,
      },
      {
        key: "compliance",
        label: "合规完整度",
        score: complianceScore,
        status: scoreLabel(complianceScore),
        summary: `待补 KYC ${pendingKycCount}，已过期 ${expiredKycCount}`,
      },
      {
        key: "operations",
        label: "运营效率",
        score: operationsScore,
        status: scoreLabel(operationsScore),
        summary: `超时积压 ${pendingApplicationOldCount + pendingContractOldCount + pendingDisbursementOldCount + pendingRepaymentOldCount} 项`,
      },
      {
        key: "portfolio",
        label: "资产组合",
        score: portfolioScore,
        status: scoreLabel(portfolioScore),
        summary: `高风险客户 ${(riskDistribution.HIGH || 0) + riskCustomers.length} 个`,
      },
    ];

    let healthScore = Math.round(
      (collectionScore * 0.3) +
        (liquidityScore * 0.25) +
        (complianceScore * 0.15) +
        (operationsScore * 0.15) +
        (portfolioScore * 0.15)
    );
    healthScore = clamp(healthScore);

    const smartTodos: Array<{
      priority: number;
      type: string;
      label: string;
      count: number;
      href: string;
      urgency: SmartTodoUrgency;
      description: string;
    }> = [];

    if (severeOverdue.length > 0) {
      smartTodos.push({
        priority: 1,
        type: "overdue_severe",
        label: `优先处理严重逾期 ${severeOverdue.length} 笔`,
        count: severeOverdue.length,
        href: "/admin/overdue",
        urgency: "critical",
        description: `超过 14 天未回款，涉及金额 ${topOverdueCustomers
          .filter((customer) => customer.maxDays > 14)
          .reduce((sum, customer) => sum + customer.totalAmount, 0)
          .toFixed(0)}`,
      });
    }

    if (pendingDisbursementAmount > 0 && coverageRatio < 1.2) {
      smartTodos.push({
        priority: 2,
        type: "cashflow_pressure",
        label: "关注资金池压力",
        count: pendingDisbursements.length,
        href: "/admin/disbursements",
        urgency: coverageRatio < 1 ? "critical" : "high",
        description: `预计 7 天资金覆盖率 ${coverageRatio.toFixed(2)}x，待放款 ${pendingDisbursementAmount.toFixed(0)}`,
      });
    }

    if (expiredKycCount > 0) {
      smartTodos.push({
        priority: 3,
        type: "kyc_expired",
        label: `补齐过期 KYC ${expiredKycCount} 项`,
        count: expiredKycCount,
        href: "/admin/customers",
        urgency: "high",
        description: "存在证件或 KYC 已过期客户，建议先补齐再推进新业务。",
      });
    }

    if (pendingApplicationOldCount > 0) {
      smartTodos.push({
        priority: 4,
        type: "stalled_application",
        label: `清理超时申请 ${pendingApplicationOldCount} 笔`,
        count: pendingApplicationOldCount,
        href: "/admin/loan-applications",
        urgency: "high",
        description: "超过 3 天未处理的申请会拉低转化率，也容易造成客户流失。",
      });
    }

    if (dueTodayItems.length > 0) {
      smartTodos.push({
        priority: 5,
        type: "due_today",
        label: `跟进今日到期 ${dueTodayItems.length} 笔`,
        count: dueTodayItems.length,
        href: "/admin/repayments",
        urgency: "high",
        description: `今日应回款 ${dueTodayTotal.toFixed(0)}，建议优先提醒客户按时还款。`,
      });
    }

    if (moderateOverdue.length > 0) {
      smartTodos.push({
        priority: 6,
        type: "overdue_moderate",
        label: `处理中度逾期 ${moderateOverdue.length} 笔`,
        count: moderateOverdue.length,
        href: "/admin/overdue",
        urgency: "medium",
        description: "逾期 8-14 天的客户建议升级沟通频次并评估展期或重组。",
      });
    }

    if (pendingRepayments.length > 0) {
      smartTodos.push({
        priority: 7,
        type: "pending_repayment",
        label: `确认待入账还款 ${pendingRepayments.length} 笔`,
        count: pendingRepayments.length,
        href: "/admin/repayments",
        urgency: "medium",
        description: `待确认金额 ${pendingRepaymentAmount.toFixed(0)}，建议当天完成核销。`,
      });
    }

    if (pendingExtensions > 0 || pendingRestructures > 0) {
      smartTodos.push({
        priority: 8,
        type: "restructure_queue",
        label: `处理展期/重组 ${pendingExtensions + pendingRestructures} 笔`,
        count: pendingExtensions + pendingRestructures,
        href: pendingExtensions > 0 ? "/admin/extensions" : "/admin/restructures",
        urgency: "medium",
        description: `待审批展期 ${pendingExtensions} 笔，重组 ${pendingRestructures} 笔。`,
      });
    }

    if (due3DayItems.length > 0) {
      smartTodos.push({
        priority: 9,
        type: "due_soon",
        label: `预热 3 天内到期 ${due3DayItems.length} 笔`,
        count: due3DayItems.length,
        href: "/admin/repayments",
        urgency: "low",
        description: `未来 3 天应回款 ${due3DayTotal.toFixed(0)}，适合提前做触达提醒。`,
      });
    }

    if (potentialReborrow.length > 0) {
      smartTodos.push({
        priority: 10,
        type: "reborrow_campaign",
        label: `跟进复借机会 ${potentialReborrow.length} 位`,
        count: potentialReborrow.length,
        href: "/admin/customers",
        urgency: "low",
        description: "这些客户历史结清好、当前无逾期，适合重点做二次营销。",
      });
    }

    smartTodos.sort((a, b) => a.priority - b.priority);

    const insights: string[] = [];
    if (severeOverdue.length > 0) {
      insights.push(`严重逾期 ${severeOverdue.length} 笔，建议先锁定催收名单与责任人。`);
    }
    if (coverageRatio < 1) {
      insights.push("未来 7 天资金覆盖不足，建议放慢出款节奏或先补充资金池。");
    } else if (coverageRatio < 1.2) {
      insights.push("资金覆盖偏紧，待放款审批需要结合回款节奏一起看。");
    }
    if (expiredKycCount > 0) {
      insights.push(`存在 ${expiredKycCount} 项过期 KYC，合规侧需要优先补齐。`);
    }
    if (pendingApplicationOldCount > 0) {
      insights.push(`有 ${pendingApplicationOldCount} 笔申请积压超过 3 天，审批效率正在拖慢转化。`);
    }
    if (potentialReborrow.length > 0) {
      insights.push(`已有 ${potentialReborrow.length} 位可复借客户，可作为近期增长的低成本抓手。`);
    }
    if (insights.length === 0) {
      insights.push("当前风险、资金和流程都比较平稳，可以继续放大优质客户转化。");
    }

    return {
      alerts: {
        dueToday: dueTodayItems.map(mapAlertItem),
        due3Day: due3DayItems.map(mapAlertItem),
        due7Day: due7DayItems.map(mapAlertItem),
        dueTodayTotal,
        due3DayTotal,
        due7DayTotal,
      },
      overdue: {
        mild: mildOverdue.length,
        moderate: moderateOverdue.length,
        severe: severeOverdue.length,
        total: overdueRecords.length,
        totalAmount: overdueTotal,
        totalPenalty: penaltyTotal,
        topCustomers: topOverdueCustomers,
        weekTrend: overdueWeekTrend,
      },
      customers: {
        total: totalCustomers,
        riskDistribution,
        valueTierDistribution,
        topBorrowers: topBorrowers.map((profile) => ({
          name: profile.name,
          phone: profile.phone,
          totalBorrowed: profile.totalBorrowed,
          activeLoans: profile.activeLoans,
          valueTier: profile.valueTier,
          riskLevel: profile.riskLevel,
        })),
        riskCustomers: riskCustomers.map((profile) => ({
          name: profile.name,
          phone: profile.phone,
          overdueCount: profile.overdueCount,
          totalBorrowed: profile.totalBorrowed,
          riskLevel: profile.riskLevel,
          hasExpiredKyc: profile.hasExpiredKyc,
        })),
        potentialReborrow: potentialReborrow.map((profile) => ({
          name: profile.name,
          phone: profile.phone,
          settledLoans: profile.settledLoans,
          totalBorrowed: profile.totalBorrowed,
        })),
        growthTrend: customerGrowthTrend,
      },
      pipeline: {
        applications: {
          total: pendingApplications.length,
          olderThan3d: pendingApplicationOldCount,
          highRisk: highRiskApplicationCount,
          items: pendingApplications.map((item) => ({
            id: item.id,
            applicationNo: item.applicationNo,
            customerName: item.customer?.name || "未知客户",
            customerPhone: item.customer?.phone || "",
            customerRisk: item.customer?.riskLevel || "NORMAL",
            amount: toNumber(item.amount),
            riskScore: toNumber(item.riskScore),
            status: item.status,
            createdAt: item.createdAt,
          })),
        },
        contracts: {
          total: pendingContracts.length,
          olderThan2d: pendingContractOldCount,
        },
        disbursements: {
          total: pendingDisbursements.length,
          olderThan1d: pendingDisbursementOldCount,
          totalAmount: pendingDisbursementAmount,
        },
        repayments: {
          total: pendingRepayments.length,
          olderThan1d: pendingRepaymentOldCount,
          totalAmount: pendingRepaymentAmount,
        },
        extensionsPending: pendingExtensions,
        restructuresPending: pendingRestructures,
      },
      compliance: {
        pendingKyc: pendingKycCount,
        expiredKyc: expiredKycCount,
        expiringSoonKyc: expiringSoonKycCount,
      },
      cashflow: {
        fundBalance,
        expectedCollections7d,
        expectedCollections30d: upcomingDue30d,
        pendingDisbursementAmount,
        predictedNetInflow7d,
        coverageRatio,
        pressureLevel: pressureLabel(coverageRatio),
      },
      riskRadar,
      smartTodos,
      health: {
        score: healthScore,
        onTimeRate,
        overdueRate,
        totalScheduleItems,
        insights,
      },
    };
  }
}
