import { prisma } from "@/lib/prisma";
import {
  AnomalyDetectionService,
  type AnomalySignal,
} from "@/services/anomaly-detection.service";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown) {
  return Number(value || 0);
}

function riskLevelFromScore(score: number) {
  if (score >= 85) return "BLACKLIST";
  if (score >= 70) return "HIGH";
  if (score <= 24) return "LOW";
  return "NORMAL";
}

function buildReasons(params: {
  settledLoans: number;
  activeOverdues: number;
  maxOverdueDays: number;
  hasExpiredKyc: boolean;
  pendingKyc: boolean;
  recentApplications7d: number;
  rejectedLoans: number;
  anomalySignals: AnomalySignal[];
}) {
  const reasons: string[] = [];

  if (params.activeOverdues > 0) {
    reasons.push(`当前存在 ${params.activeOverdues} 笔逾期记录`);
  }
  if (params.maxOverdueDays >= 7) {
    reasons.push(`历史最长逾期 ${params.maxOverdueDays} 天`);
  }
  if (params.recentApplications7d >= 2) {
    reasons.push(`近 7 天申请 ${params.recentApplications7d} 笔`);
  }
  if (params.hasExpiredKyc) {
    reasons.push("KYC 已过期");
  } else if (params.pendingKyc) {
    reasons.push("KYC 仍待完善");
  }
  if (params.rejectedLoans > 0) {
    reasons.push(`历史被拒 ${params.rejectedLoans} 次`);
  }
  if (params.settledLoans >= 2 && params.activeOverdues === 0) {
    reasons.push(`历史已结清 ${params.settledLoans} 笔，可作为复借加分`);
  }
  params.anomalySignals.forEach((item) => reasons.push(item.title));

  return reasons.slice(0, 6);
}

function buildProfileFromSnapshot(snapshot: {
  id: string;
  name: string;
  phone: string;
  riskLevel: string;
  createdAt: Date;
  loanApplications: Array<{
    status: string;
    createdAt: Date;
    riskScore: unknown;
    amount: unknown;
  }>;
  overdueRecords: Array<{
    status: string;
    overdueDays: number;
    overdueAmount: unknown;
  }>;
  kyc: Array<{
    status: string;
    expiresAt: Date | null;
  }>;
  anomalySignals?: AnomalySignal[];
}) {
  const now = new Date();
  const day7Ago = addDays(now, -7);
  const loans = snapshot.loanApplications;
  const settledLoans = loans.filter((item) => ["SETTLED", "COMPLETED"].includes(item.status)).length;
  const rejectedLoans = loans.filter((item) => item.status === "REJECTED").length;
  const recentApplications7d = loans.filter((item) => item.createdAt >= day7Ago).length;
  const activeOverdues = snapshot.overdueRecords.filter((item) => item.status === "OVERDUE").length;
  const maxOverdueDays = snapshot.overdueRecords.reduce(
    (max, item) => Math.max(max, item.overdueDays || 0),
    0
  );
  const overdueAmount = snapshot.overdueRecords.reduce(
    (sum, item) => sum + toNumber(item.overdueAmount),
    0
  );
  const hasExpiredKyc = snapshot.kyc.some(
    (item) => item.status === "EXPIRED" || (item.expiresAt ? item.expiresAt < now : false)
  );
  const pendingKyc = snapshot.kyc.some((item) => item.status === "PENDING");
  const anomalySignals = snapshot.anomalySignals ?? [];
  const anomalyPenalty = anomalySignals.reduce((sum, item) => {
    if (item.severity === "critical") return sum + 18;
    if (item.severity === "high") return sum + 10;
    if (item.severity === "medium") return sum + 6;
    return sum + 3;
  }, 0);

  const behaviorScore = clamp(
    92 -
      activeOverdues * 24 -
      Math.min(maxOverdueDays, 20) * 1.4 -
      (hasExpiredKyc ? 16 : pendingKyc ? 8 : 0) -
      Math.max(0, recentApplications7d - 1) * 8 -
      anomalyPenalty
  );

  const repeatBorrowScore = clamp(
    settledLoans * 24 +
      (settledLoans > 0 && activeOverdues === 0 ? 18 : 0) -
      rejectedLoans * 6 -
      activeOverdues * 14 -
      (hasExpiredKyc ? 12 : 0)
  );

  const overdueProbability = clamp(
    18 +
      activeOverdues * 20 +
      Math.min(maxOverdueDays, 30) * 1.3 +
      Math.max(0, recentApplications7d - 1) * 7 +
      anomalyPenalty -
      settledLoans * 6 -
      (pendingKyc ? 3 : 0) -
      (hasExpiredKyc ? 0 : 4)
  );

  const recommendedRiskScore = Math.round(
    clamp(
      overdueProbability * 0.45 +
        (100 - behaviorScore) * 0.35 +
        (100 - repeatBorrowScore) * 0.2
    )
  );

  return {
    customerId: snapshot.id,
    name: snapshot.name,
    phone: snapshot.phone,
    currentRiskLevel: snapshot.riskLevel,
    behaviorScore: Math.round(behaviorScore),
    repeatBorrowScore: Math.round(repeatBorrowScore),
    overdueProbability: Math.round(overdueProbability),
    anomalyCount: anomalySignals.length,
    anomalySignals,
    recommendedRiskScore,
    recommendedRiskLevel: riskLevelFromScore(recommendedRiskScore),
    activeOverdues,
    maxOverdueDays,
    settledLoans,
    recentApplications7d,
    overdueAmount: Number(overdueAmount.toFixed(2)),
    reasons: buildReasons({
      settledLoans,
      activeOverdues,
      maxOverdueDays,
      hasExpiredKyc,
      pendingKyc,
      recentApplications7d,
      rejectedLoans,
      anomalySignals,
    }),
  };
}

export class RiskIntelligenceService {
  static async getCustomerProfile(customerId: string) {
    const [customer, anomalySignals] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
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
              status: true,
              createdAt: true,
              riskScore: true,
              amount: true,
            },
            orderBy: { createdAt: "desc" },
          },
          overdueRecords: {
            select: {
              status: true,
              overdueDays: true,
              overdueAmount: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      AnomalyDetectionService.scanCustomer(customerId),
    ]);

    if (!customer) return null;

    return buildProfileFromSnapshot({
      ...customer,
      anomalySignals,
    });
  }

  static async getApplicationRecommendation(applicationId: string) {
    const application = await prisma.loanApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        customerId: true,
        riskScore: true,
        riskComment: true,
      },
    });

    if (!application) return null;

    const profile = await this.getCustomerProfile(application.customerId);
    if (!profile) return null;

    return {
      applicationId,
      manualRiskScore: application.riskScore ? Number(application.riskScore) : null,
      manualRiskComment: application.riskComment,
      ...profile,
    };
  }

  static async getDashboardSummary() {
    const customers = await prisma.customer.findMany({
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
            status: true,
            createdAt: true,
            riskScore: true,
            amount: true,
          },
        },
        overdueRecords: {
          select: {
            status: true,
            overdueDays: true,
            overdueAmount: true,
          },
        },
      },
    });

    const profiles = customers
      .map((customer) => buildProfileFromSnapshot(customer))
      .sort((a, b) => b.recommendedRiskScore - a.recommendedRiskScore);

    const averageRecommendedRiskScore =
      profiles.length > 0
        ? Math.round(
            profiles.reduce((sum, item) => sum + item.recommendedRiskScore, 0) / profiles.length
          )
        : 0;

    const overdueProbabilityAverage =
      profiles.length > 0
        ? Math.round(
            profiles.reduce((sum, item) => sum + item.overdueProbability, 0) / profiles.length
          )
        : 0;

    return {
      averageRecommendedRiskScore,
      overdueProbabilityAverage,
      highRiskCustomers: profiles.filter((item) => item.recommendedRiskLevel === "HIGH").length,
      blacklistCandidates: profiles.filter((item) => item.recommendedRiskLevel === "BLACKLIST")
        .length,
      repeatBorrowCandidates: profiles.filter(
        (item) => item.settledLoans >= 2 && item.activeOverdues === 0 && item.recommendedRiskScore < 45
      ).length,
      topSignals: profiles.slice(0, 6).map((item) => ({
        customerId: item.customerId,
        name: item.name,
        phone: item.phone,
        recommendedRiskScore: item.recommendedRiskScore,
        recommendedRiskLevel: item.recommendedRiskLevel,
        overdueProbability: item.overdueProbability,
        reasons: item.reasons,
      })),
    };
  }
}
