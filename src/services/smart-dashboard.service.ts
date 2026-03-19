import { prisma } from "@/lib/prisma";

/**
 * 智能工作台服务 —— 提供预警、客户画像、智能待办、业务健康度等分析数据
 */
export class SmartDashboardService {
  static async getSmartData() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);
    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);
    const day30Ago = new Date(today);
    day30Ago.setDate(day30Ago.getDate() - 30);

    const [
      // ── 到期预警 ──
      dueTodayItems,
      due3DayItems,
      due7DayItems,

      // ── 逾期跟踪 ──
      overdueRecords,

      // ── 客户分析 ──
      customersByRisk,
      customersWithLoans,
      totalCustomers,

      // ── 审批流水线 ──
      pendingApplications,
      pendingContracts,
      pendingDisbursements,
      pendingRepayments,

      // ── 新增客户趋势 ──
      recentNewCustomers,

      // ── 还款performance ──
      repaymentPerformance,

      // ── 近30天逾期趋势 ──
      overdueHistory,
    ] = await Promise.all([
      // 今日到期
      prisma.repaymentScheduleItem.findMany({
        where: { status: { in: ["PENDING", "PARTIAL"] }, dueDate: { gte: today, lt: tomorrow } },
        include: { plan: true },
        orderBy: { dueDate: "asc" },
      }),
      // 3天内到期
      prisma.repaymentScheduleItem.findMany({
        where: { status: { in: ["PENDING", "PARTIAL"] }, dueDate: { gte: tomorrow, lt: in3Days } },
        include: { plan: true },
      }),
      // 7天内到期
      prisma.repaymentScheduleItem.findMany({
        where: { status: { in: ["PENDING", "PARTIAL"] }, dueDate: { gte: in3Days, lt: in7Days } },
        include: { plan: true },
      }),

      // 全部活跃逾期记录
      prisma.overdueRecord.findMany({
        where: { status: "OVERDUE" },
        include: { customer: { select: { id: true, name: true, phone: true, riskLevel: true } } },
        orderBy: { overdueDays: "desc" },
      }),

      // 客户风险分布
      prisma.customer.groupBy({
        by: ["riskLevel"],
        where: { deletedAt: null },
        _count: true,
      }),

      // 有贷款历史的客户(客户画像)
      prisma.customer.findMany({
        where: { deletedAt: null },
        select: {
          id: true, name: true, phone: true, riskLevel: true, createdAt: true,
          loanApplications: {
            select: { id: true, status: true, amount: true, createdAt: true },
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
          },
          overdueRecords: {
            select: { id: true, status: true, overdueDays: true, overdueAmount: true },
          },
        },
      }),

      prisma.customer.count({ where: { deletedAt: null } }),

      // 待审批申请
      prisma.loanApplication.findMany({
        where: { status: { in: ["SUBMITTED", "PENDING_RISK", "PENDING_APPROVAL"] }, deletedAt: null },
        include: { customer: { select: { name: true, phone: true, riskLevel: true } } },
        orderBy: { createdAt: "asc" },
        take: 20,
      }),

      prisma.contract.count({ where: { status: "DRAFT" } }),
      prisma.disbursement.count({ where: { status: "PENDING" } }),
      prisma.repayment.count({ where: { status: "PENDING" } }),

      // 近30天新增客户
      prisma.customer.findMany({
        where: { deletedAt: null, createdAt: { gte: day30Ago } },
        select: { createdAt: true },
      }),

      // 还款performance
      prisma.repaymentScheduleItem.groupBy({
        by: ["status"],
        _count: true,
        _sum: { totalDue: true },
      }),

      // 近30天逾期趋势（已有记录 + 历史）
      prisma.overdueRecord.findMany({
        where: { createdAt: { gte: day30Ago } },
        select: { createdAt: true, overdueDays: true, overdueAmount: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // ════════════ 数据加工 ════════════

    // ─── 到期预警明细 ───
    const mapAlertItem = (item: typeof dueTodayItems[0]) => ({
      id: item.id,
      amount: Number(item.remaining || item.totalDue),
      dueDate: item.dueDate,
      planId: item.planId,
      periodNumber: item.periodNumber,
    });

    // ─── 逾期分级 ───
    const mildOverdue = overdueRecords.filter((r) => r.overdueDays <= 7);
    const moderateOverdue = overdueRecords.filter((r) => r.overdueDays > 7 && r.overdueDays <= 14);
    const severeOverdue = overdueRecords.filter((r) => r.overdueDays > 14);
    const overdueTotal = overdueRecords.reduce((s, r) => s + Number(r.overdueAmount), 0);
    const penaltyTotal = overdueRecords.reduce((s, r) => s + Number(r.penaltyAmount), 0);

    // 逾期客户聚合排行
    const overdueByCustomer: Record<string, {
      name: string; phone: string; customerId: string; riskLevel: string;
      totalAmount: number; totalPenalty: number; maxDays: number; count: number;
    }> = {};
    for (const r of overdueRecords) {
      const cust = r.customer;
      if (!cust) continue;
      if (!overdueByCustomer[cust.id]) {
        overdueByCustomer[cust.id] = {
          name: cust.name, phone: cust.phone || "", customerId: cust.id,
          riskLevel: cust.riskLevel, totalAmount: 0, totalPenalty: 0, maxDays: 0, count: 0,
        };
      }
      const entry = overdueByCustomer[cust.id];
      entry.totalAmount += Number(r.overdueAmount);
      entry.totalPenalty += Number(r.penaltyAmount);
      entry.maxDays = Math.max(entry.maxDays, r.overdueDays);
      entry.count++;
    }
    const topOverdueCustomers = Object.values(overdueByCustomer)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 10);

    // ─── 客户画像分析 ───
    const customerProfiles = customersWithLoans.map((c) => {
      const loans = c.loanApplications || [];
      const totalLoans = loans.length;
      const activeLoans = loans.filter((l) => l.status === "DISBURSED").length;
      const settledLoans = loans.filter((l) => ["SETTLED", "COMPLETED"].includes(l.status)).length;
      const rejectedLoans = loans.filter((l) => l.status === "REJECTED").length;
      const totalBorrowed = loans.reduce((s, l) => s + Number(l.amount || 0), 0);
      const overdueCount = (c.overdueRecords || []).filter((o) => o.status === "OVERDUE").length;
      const historicalOverdue = (c.overdueRecords || []).length;

      // 客户价值评级
      let valueTier: string;
      if (totalLoans === 0) valueTier = "潜在客户";
      else if (settledLoans >= 3 && overdueCount === 0) valueTier = "优质客户";
      else if (settledLoans >= 1 && overdueCount === 0) valueTier = "良好客户";
      else if (activeLoans > 0 && overdueCount === 0) valueTier = "正常客户";
      else if (overdueCount > 0) valueTier = "风险客户";
      else if (rejectedLoans > 0 && totalLoans === rejectedLoans) valueTier = "拒绝客户";
      else valueTier = "新客户";

      return {
        id: c.id, name: c.name, phone: c.phone, riskLevel: c.riskLevel,
        totalLoans, activeLoans, settledLoans, totalBorrowed, overdueCount,
        historicalOverdue, valueTier,
        lastActivity: loans.length > 0 ? loans[0].createdAt : c.createdAt,
      };
    });

    // 客户价值分布
    const valueTierDist: Record<string, number> = {};
    for (const p of customerProfiles) {
      valueTierDist[p.valueTier] = (valueTierDist[p.valueTier] || 0) + 1;
    }

    // 风险分布
    const riskDist: Record<string, number> = {};
    for (const g of customersByRisk) {
      riskDist[g.riskLevel || "NORMAL"] = g._count;
    }

    // 高价值客户 TOP5
    const topValueCustomers = customerProfiles
      .filter((p) => p.totalLoans > 0)
      .sort((a, b) => b.totalBorrowed - a.totalBorrowed)
      .slice(0, 5);

    // 风险客户（有逾期记录）
    const riskCustomers = customerProfiles
      .filter((p) => p.overdueCount > 0)
      .sort((a, b) => b.overdueCount - a.overdueCount)
      .slice(0, 5);

    // 潜在复借客户（已结清、无逾期、近30天内活动过）
    const potentialReborrow = customerProfiles
      .filter((p) => p.settledLoans > 0 && p.overdueCount === 0 && p.activeLoans === 0)
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
      .slice(0, 5);

    // ─── 客户增长趋势（4周） ───
    const weekBuckets = [0, 0, 0, 0];
    for (const c of recentNewCustomers) {
      const daysDiff = Math.floor((now.getTime() - new Date(c.createdAt).getTime()) / 86400000);
      const weekIdx = Math.min(3, Math.floor(daysDiff / 7));
      weekBuckets[3 - weekIdx]++;
    }

    // ─── 智能待办(自动生成，按紧急度排序) ───
    type Urgency = "critical" | "high" | "medium" | "low";
    const smartTodos: Array<{
      priority: number; type: string; label: string;
      count: number; href: string; urgency: Urgency;
      description: string;
    }> = [];

    if (severeOverdue.length > 0) {
      smartTodos.push({
        priority: 1, type: "overdue_severe",
        label: `严重逾期 ${severeOverdue.length} 笔`,
        description: `超过14天未还，累计金额 €${overdueByCustomer ? Object.values(overdueByCustomer).filter(c => c.maxDays > 14).reduce((s, c) => s + c.totalAmount, 0).toFixed(0) : 0}`,
        count: severeOverdue.length, href: "/admin/repayments", urgency: "critical",
      });
    }
    if (moderateOverdue.length > 0) {
      smartTodos.push({
        priority: 2, type: "overdue_moderate",
        label: `中度逾期 ${moderateOverdue.length} 笔`,
        description: "逾期8-14天，建议电话催收并评估是否需要展期",
        count: moderateOverdue.length, href: "/admin/repayments", urgency: "high",
      });
    }
    if (dueTodayItems.length > 0) {
      const todayAmt = dueTodayItems.reduce((s, i) => s + Number(i.remaining || i.totalDue), 0);
      smartTodos.push({
        priority: 3, type: "due_today",
        label: `今日到期 ${dueTodayItems.length} 笔`,
        description: `合计 €${todayAmt.toFixed(0)}，请提醒客户按时还款`,
        count: dueTodayItems.length, href: "/admin/repayments", urgency: "high",
      });
    }
    if (mildOverdue.length > 0) {
      smartTodos.push({
        priority: 4, type: "overdue_mild",
        label: `轻度逾期 ${mildOverdue.length} 笔`,
        description: "逾期1-7天，在宽限期范围内，建议短信提醒",
        count: mildOverdue.length, href: "/admin/repayments", urgency: "medium",
      });
    }
    if (pendingRepayments > 0) {
      smartTodos.push({
        priority: 5, type: "pending_repayment",
        label: `待确认还款 ${pendingRepayments} 笔`,
        description: "客户已提交还款，需验证并确认到账",
        count: pendingRepayments, href: "/admin/repayments", urgency: "medium",
      });
    }
    if (pendingApplications.length > 0) {
      smartTodos.push({
        priority: 6, type: "pending_approval",
        label: `待审批申请 ${pendingApplications.length} 个`,
        description: "新借款申请待风控审核和审批",
        count: pendingApplications.length, href: "/admin/loan-applications", urgency: "medium",
      });
    }
    if (pendingContracts > 0) {
      smartTodos.push({
        priority: 7, type: "pending_contract",
        label: `待签合同 ${pendingContracts} 份`,
        description: "合同已生成，等待客户签署",
        count: pendingContracts, href: "/admin/loan-applications", urgency: "low",
      });
    }
    if (pendingDisbursements > 0) {
      smartTodos.push({
        priority: 8, type: "pending_disbursement",
        label: `待放款 ${pendingDisbursements} 笔`,
        description: "已签约等待放款出账",
        count: pendingDisbursements, href: "/admin/disbursements", urgency: "low",
      });
    }
    if (due3DayItems.length > 0) {
      const amt3 = due3DayItems.reduce((s, i) => s + Number(i.remaining || i.totalDue), 0);
      smartTodos.push({
        priority: 9, type: "due_3day",
        label: `3天内到期 ${due3DayItems.length} 笔`,
        description: `合计 €${amt3.toFixed(0)}，建议提前联系客户准备还款`,
        count: due3DayItems.length, href: "/admin/repayments", urgency: "low",
      });
    }
    if (potentialReborrow.length > 0) {
      smartTodos.push({
        priority: 10, type: "potential_reborrow",
        label: `${potentialReborrow.length} 位优质客户可复借`,
        description: "已结清且无逾期记录的客户，可主动营销",
        count: potentialReborrow.length, href: "/admin/customers", urgency: "low",
      });
    }

    smartTodos.sort((a, b) => a.priority - b.priority);

    // ─── 还款表现统计 ───
    const totalSchedule = repaymentPerformance.reduce((s, g) => s + g._count, 0);
    const paidCount = repaymentPerformance.find((g) => g.status === "PAID")?._count || 0;
    const overdueItemCount = repaymentPerformance.find((g) => g.status === "OVERDUE")?._count || 0;
    const onTimeRate = totalSchedule > 0 ? Math.round((paidCount / totalSchedule) * 1000) / 10 : 0;
    const overdueRate = totalSchedule > 0 ? Math.round((overdueItemCount / totalSchedule) * 1000) / 10 : 0;

    // ─── 逾期趋势(按周聚合) ───
    const overdueWeekTrend = [0, 0, 0, 0];
    for (const r of overdueHistory) {
      const daysDiff = Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / 86400000);
      const weekIdx = Math.min(3, Math.floor(daysDiff / 7));
      overdueWeekTrend[3 - weekIdx]++;
    }

    // ─── 业务健康评分(0-100) ───
    let healthScore = 70; // 基础分
    if (overdueRecords.length === 0) healthScore += 15;
    else if (severeOverdue.length === 0) healthScore += 5;
    else healthScore -= severeOverdue.length * 3;
    if (onTimeRate > 90) healthScore += 10;
    else if (onTimeRate > 70) healthScore += 5;
    if (dueTodayItems.length === 0 && mildOverdue.length === 0) healthScore += 5;
    healthScore = Math.max(0, Math.min(100, healthScore));

    // ─── 智能建议 ───
    const insights: string[] = [];
    if (severeOverdue.length > 0) {
      insights.push(`⚠️ ${severeOverdue.length} 笔严重逾期需立即处理，建议启动法务催收流程`);
    }
    if (dueTodayItems.length > 0) {
      insights.push(`📞 今日有 ${dueTodayItems.length} 笔到期，建议提前电话提醒客户`);
    }
    if (potentialReborrow.length > 0) {
      insights.push(`💰 ${potentialReborrow.length} 位优质客户可复借，历史还款良好，可主动营销`);
    }
    if (overdueRate > 20) {
      insights.push("🔴 逾期率超过20%，建议收紧审批标准并加强贷前审核");
    } else if (overdueRate > 10) {
      insights.push("🟡 逾期率偏高，建议关注高风险客户并加强催收力度");
    }
    if (riskCustomers.length > 3) {
      insights.push(`🛡️ ${riskCustomers.length} 位客户存在逾期风险标记，建议限制其新贷申请`);
    }
    const pendingTotal = pendingApplications.length + pendingContracts + pendingDisbursements;
    if (pendingTotal > 10) {
      insights.push(`📋 积压待办 ${pendingTotal} 项，建议增派人手处理避免客户流失`);
    }
    if (due7DayItems.length > 5) {
      insights.push(`📅 未来7天有 ${due3DayItems.length + due7DayItems.length} 笔到期，请提前做好回款准备`);
    }
    if (insights.length === 0) {
      insights.push("✅ 当前业务运行正常，各项指标健康");
    }

    return {
      // 到期预警
      alerts: {
        dueToday: dueTodayItems.map(mapAlertItem),
        due3Day: due3DayItems.map(mapAlertItem),
        due7Day: due7DayItems.map(mapAlertItem),
        dueTodayTotal: dueTodayItems.reduce((s, i) => s + Number(i.remaining || i.totalDue), 0),
        due3DayTotal: due3DayItems.reduce((s, i) => s + Number(i.remaining || i.totalDue), 0),
        due7DayTotal: due7DayItems.reduce((s, i) => s + Number(i.remaining || i.totalDue), 0),
      },

      // 逾期跟踪
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

      // 客户画像
      customers: {
        total: totalCustomers,
        riskDistribution: riskDist,
        valueTierDistribution: valueTierDist,
        topBorrowers: topValueCustomers.map((p) => ({
          name: p.name, phone: p.phone, totalBorrowed: p.totalBorrowed,
          activeLoans: p.activeLoans, valueTier: p.valueTier, riskLevel: p.riskLevel,
        })),
        riskCustomers: riskCustomers.map((p) => ({
          name: p.name, phone: p.phone, overdueCount: p.overdueCount,
          totalBorrowed: p.totalBorrowed, riskLevel: p.riskLevel,
        })),
        potentialReborrow: potentialReborrow.map((p) => ({
          name: p.name, phone: p.phone, settledLoans: p.settledLoans,
          totalBorrowed: p.totalBorrowed,
        })),
        growthTrend: weekBuckets,
      },

      // 智能待办
      smartTodos,

      // 审批管线
      pipeline: {
        applications: pendingApplications.map((a) => ({
          id: a.id, customerName: a.customer?.name || "未知",
          customerPhone: a.customer?.phone || "",
          customerRisk: a.customer?.riskLevel || "NORMAL",
          amount: Number(a.amount), status: a.status, createdAt: a.createdAt,
        })),
        pendingContracts,
        pendingDisbursements,
        pendingRepayments,
      },

      // 业务健康度
      health: {
        score: healthScore,
        onTimeRate,
        overdueRate,
        totalScheduleItems: totalSchedule,
        insights,
      },
    };
  }
}
