import { prisma } from "@/lib/prisma";

type AnomalySeverity = "low" | "medium" | "high" | "critical";
type AnomalyType =
  | "shared_device"
  | "profile_churn"
  | "application_burst"
  | "withdrawal_spike";

export type AnomalySignal = {
  type: AnomalyType;
  severity: AnomalySeverity;
  entityType: "customer" | "funder";
  entityId: string;
  title: string;
  summary: string;
  detectedAt: Date;
  metrics: Record<string, number | string>;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toNumber(value: unknown) {
  return Number(value || 0);
}

function severityRank(value: AnomalySeverity) {
  if (value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

export class AnomalyDetectionService {
  static async scanCustomer(customerId: string): Promise<AnomalySignal[]> {
    const now = new Date();
    const day1Ago = addDays(now, -1);
    const day7Ago = addDays(now, -7);

    const [confirmations, customerAudits, recentApplications] = await Promise.all([
      prisma.repaymentConfirmation.findMany({
        where: { customerId },
        select: {
          deviceInfo: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.auditLog.findMany({
        where: {
          entityType: "customer",
          entityId: customerId,
          action: "update",
          createdAt: { gte: day7Ago },
        },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.loanApplication.findMany({
        where: {
          customerId,
          deletedAt: null,
          createdAt: { gte: day7Ago },
        },
        select: {
          id: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const incidents: AnomalySignal[] = [];
    const uniqueDevices = Array.from(
      new Set(confirmations.map((item) => item.deviceInfo?.trim()).filter((item): item is string => Boolean(item)))
    );

    for (const deviceInfo of uniqueDevices) {
      const related = await prisma.repaymentConfirmation.findMany({
        where: { deviceInfo },
        select: {
          customerId: true,
          createdAt: true,
        },
        distinct: ["customerId"],
      });

      if (related.length > 1) {
        incidents.push({
          type: "shared_device",
          severity: related.length >= 3 ? "critical" : "high",
          entityType: "customer",
          entityId: customerId,
          title: "同设备多账号",
          summary: `该客户使用过的设备，已关联 ${related.length} 个客户账号。`,
          detectedAt: related[0]?.createdAt || now,
          metrics: {
            linkedCustomers: related.length,
          },
        });
      }
    }

    if (customerAudits.length >= 3) {
      incidents.push({
        type: "profile_churn",
        severity: customerAudits.length >= 5 ? "high" : "medium",
        entityType: "customer",
        entityId: customerId,
        title: "资料短期频繁变更",
        summary: `近 7 天客户资料被修改 ${customerAudits.length} 次，建议人工复核。`,
        detectedAt: customerAudits[0]?.createdAt || now,
        metrics: {
          updateCount7d: customerAudits.length,
        },
      });
    }

    const applications24h = recentApplications.filter((item) => item.createdAt >= day1Ago);
    if (applications24h.length >= 2 || recentApplications.length >= 3) {
      incidents.push({
        type: "application_burst",
        severity: applications24h.length >= 3 || recentApplications.length >= 4 ? "critical" : "high",
        entityType: "customer",
        entityId: customerId,
        title: "短时多次借款申请",
        summary: `近 24 小时申请 ${applications24h.length} 笔，近 7 天申请 ${recentApplications.length} 笔。`,
        detectedAt: recentApplications[0]?.createdAt || now,
        metrics: {
          applications24h: applications24h.length,
          applications7d: recentApplications.length,
        },
      });
    }

    return incidents.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  }

  static async getDashboardSummary() {
    const now = new Date();
    const day1Ago = addDays(now, -1);
    const day7Ago = addDays(now, -7);

    const [deviceRows, auditRows, applicationRows, withdrawalRows, funders] = await Promise.all([
      prisma.repaymentConfirmation.findMany({
        where: { deviceInfo: { not: null } },
        select: {
          customerId: true,
          deviceInfo: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.findMany({
        where: {
          entityType: "customer",
          action: "update",
          createdAt: { gte: day7Ago },
        },
        select: {
          entityId: true,
          createdAt: true,
        },
      }),
      prisma.loanApplication.findMany({
        where: {
          deletedAt: null,
          createdAt: { gte: day7Ago },
        },
        select: {
          id: true,
          customerId: true,
          createdAt: true,
        },
      }),
      prisma.funderWithdrawal.findMany({
        where: {
          createdAt: { gte: day7Ago },
        },
        select: {
          id: true,
          funderId: true,
          amount: true,
          createdAt: true,
        },
      }),
      prisma.funder.findMany({
        where: { deletedAt: null, isActive: true },
        select: {
          id: true,
          name: true,
          accounts: {
            where: { isActive: true },
            select: {
              balance: true,
              totalInflow: true,
            },
          },
        },
      }),
    ]);

    const incidents: AnomalySignal[] = [];

    const deviceMap = new Map<string, { customerIds: Set<string>; latestAt: Date }>();
    for (const row of deviceRows) {
      const deviceInfo = row.deviceInfo?.trim();
      if (!deviceInfo) continue;

      const current = deviceMap.get(deviceInfo) || {
        customerIds: new Set<string>(),
        latestAt: row.createdAt,
      };

      current.customerIds.add(row.customerId);
      if (row.createdAt > current.latestAt) current.latestAt = row.createdAt;
      deviceMap.set(deviceInfo, current);
    }

    deviceMap.forEach((value, deviceInfo) => {
      const linkedCustomers = value.customerIds.size;
      if (linkedCustomers <= 1) return;

      incidents.push({
        type: "shared_device",
        severity: linkedCustomers >= 3 ? "critical" : "high",
        entityType: "customer",
        entityId: deviceInfo,
        title: "同设备多账号",
        summary: `检测到 1 台设备关联 ${linkedCustomers} 个客户账号。`,
        detectedAt: value.latestAt,
        metrics: {
          linkedCustomers,
        },
      });
    });

    const auditMap = new Map<string, { count: number; latestAt: Date }>();
    for (const row of auditRows) {
      const current = auditMap.get(row.entityId) || {
        count: 0,
        latestAt: row.createdAt,
      };
      current.count += 1;
      if (row.createdAt > current.latestAt) current.latestAt = row.createdAt;
      auditMap.set(row.entityId, current);
    }

    auditMap.forEach((value, customerId) => {
      if (value.count < 3) return;
      incidents.push({
        type: "profile_churn",
        severity: value.count >= 5 ? "high" : "medium",
        entityType: "customer",
        entityId: customerId,
        title: "资料频繁修改",
        summary: `近 7 天客户资料被更新 ${value.count} 次。`,
        detectedAt: value.latestAt,
        metrics: {
          updateCount7d: value.count,
        },
      });
    });

    const applicationMap = new Map<string, { count7d: number; count24h: number; latestAt: Date }>();
    for (const row of applicationRows) {
      const current = applicationMap.get(row.customerId) || {
        count7d: 0,
        count24h: 0,
        latestAt: row.createdAt,
      };
      current.count7d += 1;
      if (row.createdAt >= day1Ago) current.count24h += 1;
      if (row.createdAt > current.latestAt) current.latestAt = row.createdAt;
      applicationMap.set(row.customerId, current);
    }

    applicationMap.forEach((value, customerId) => {
      if (value.count24h < 2 && value.count7d < 3) return;
      incidents.push({
        type: "application_burst",
        severity: value.count24h >= 3 || value.count7d >= 4 ? "critical" : "high",
        entityType: "customer",
        entityId: customerId,
        title: "短时多次借款申请",
        summary: `近 24 小时 ${value.count24h} 笔，近 7 天 ${value.count7d} 笔。`,
        detectedAt: value.latestAt,
        metrics: {
          applications24h: value.count24h,
          applications7d: value.count7d,
        },
      });
    });

    const funderBalanceMap = new Map(
      funders.map((funder) => [
        funder.id,
        {
          name: funder.name,
          balance: funder.accounts.reduce((sum, account) => sum + toNumber(account.balance), 0),
          inflow: funder.accounts.reduce((sum, account) => sum + toNumber(account.totalInflow), 0),
        },
      ])
    );

    const withdrawalMap = new Map<string, { count: number; amount: number; latestAt: Date }>();
    for (const row of withdrawalRows) {
      const current = withdrawalMap.get(row.funderId) || {
        count: 0,
        amount: 0,
        latestAt: row.createdAt,
      };
      current.count += 1;
      current.amount += toNumber(row.amount);
      if (row.createdAt > current.latestAt) current.latestAt = row.createdAt;
      withdrawalMap.set(row.funderId, current);
    }

    withdrawalMap.forEach((value, funderId) => {
      const funder = funderBalanceMap.get(funderId);
      const benchmark = Math.max(funder?.balance || 0, funder?.inflow || 0, 1);
      const ratio = value.amount / benchmark;
      if (value.count < 2 && ratio < 0.7) return;

      incidents.push({
        type: "withdrawal_spike",
        severity: value.count >= 3 || ratio >= 0.9 ? "critical" : "high",
        entityType: "funder",
        entityId: funderId,
        title: "异常提现行为",
        summary: `${funder?.name || "资金方"}近 7 天提现 ${value.count} 笔，金额 ${value.amount.toFixed(2)}。`,
        detectedAt: value.latestAt,
        metrics: {
          withdrawalCount7d: value.count,
          withdrawalAmount7d: Number(value.amount.toFixed(2)),
          withdrawalRatio: Number(ratio.toFixed(2)),
        },
      });
    });

    incidents.sort((a, b) => {
      const rankDiff = severityRank(b.severity) - severityRank(a.severity);
      if (rankDiff !== 0) return rankDiff;
      return b.detectedAt.getTime() - a.detectedAt.getTime();
    });

    return {
      total: incidents.length,
      critical: incidents.filter((item) => item.severity === "critical").length,
      high: incidents.filter((item) => item.severity === "high").length,
      byType: {
        sharedDevice: incidents.filter((item) => item.type === "shared_device").length,
        profileChurn: incidents.filter((item) => item.type === "profile_churn").length,
        applicationBurst: incidents.filter((item) => item.type === "application_burst").length,
        withdrawalSpike: incidents.filter((item) => item.type === "withdrawal_spike").length,
      },
      incidents: incidents.slice(0, 8),
    };
  }
}
