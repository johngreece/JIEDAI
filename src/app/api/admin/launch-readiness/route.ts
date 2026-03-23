import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { SmartDashboardService } from "@/services/smart-dashboard.service";

export const dynamic = "force-dynamic";

function toClientAction(type: string, templateCode: string | null) {
  if (type === "REPAYMENT_CONFIRM") {
    const repaymentId = templateCode?.replace("CLIENT_PENDING_CONFIRM_", "") ?? "";
    if (repaymentId) {
      return {
        actionUrl: `/client/sign/repayment/${repaymentId}`,
        actionLabel: "去确认付款",
      };
    }
  }

  if (["REPAYMENT_DUE_SOON", "REPAYMENT_DUE_TODAY", "REPAYMENT_OVERDUE"].includes(type)) {
    return {
      actionUrl: "/client/repayments?focus=current",
      actionLabel: "去处理还款",
    };
  }

  if (type === "REPAYMENT_PENDING_RECEIPT") {
    return {
      actionUrl: "/client/repayments?focus=pending-receipt",
      actionLabel: "查看确认状态",
    };
  }

  if (type === "DISBURSEMENT_RECEIVED") {
    return {
      actionUrl: "/client/dashboard",
      actionLabel: "查看当前借款",
    };
  }

  return {
    actionUrl: "/client/dashboard",
    actionLabel: "立即查看",
  };
}

export async function GET() {
  const session = await requirePermission(["dashboard:view"]);
  if (session instanceof Response) return session;

  const smart = await SmartDashboardService.getSmartData();

  const activeApplication = await prisma.loanApplication.findFirst({
    where: {
      deletedAt: null,
      status: {
        in: ["DISBURSED", "PENDING_DISBURSEMENT", "PENDING_CONTRACT", "CONTRACT_SIGNED"],
      },
      customer: {
        deletedAt: null,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      applicationNo: true,
      status: true,
      createdAt: true,
      customerId: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
  });

  const plan = activeApplication
    ? await prisma.repaymentPlan.findFirst({
        where: { applicationId: activeApplication.id, status: "ACTIVE" },
        select: {
          id: true,
          scheduleItems: {
            where: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
            orderBy: { dueDate: "asc" },
            take: 1,
            select: {
              id: true,
              dueDate: true,
              status: true,
              totalDue: true,
              remaining: true,
            },
          },
        },
      })
    : null;

  const notifications = activeApplication
    ? await prisma.notification.findMany({
        where: { customerId: activeApplication.customerId },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          type: true,
          templateCode: true,
          title: true,
          content: true,
          createdAt: true,
          isRead: true,
        },
      })
    : [];

  const nextScheduleItem = plan?.scheduleItems[0] ?? null;

  return NextResponse.json({
    testClient: activeApplication
      ? {
          id: activeApplication.customer.id,
          name: activeApplication.customer.name,
          phone: activeApplication.customer.phone,
        }
      : null,
    activeApplication: activeApplication
      ? {
          id: activeApplication.id,
          applicationNo: activeApplication.applicationNo,
          status: activeApplication.status,
          createdAt: activeApplication.createdAt,
          nextScheduleItem: nextScheduleItem
            ? {
                id: nextScheduleItem.id,
                dueDate: nextScheduleItem.dueDate,
                status: nextScheduleItem.status,
                totalDue: Number(nextScheduleItem.totalDue),
                remaining: Number(nextScheduleItem.remaining),
              }
            : null,
        }
      : null,
    notifications: notifications.map((item) => ({
      ...item,
      ...toClientAction(item.type, item.templateCode),
    })),
    smartSummary: {
      healthScore: smart.health.score,
      collectionStages: smart.collectionAutomation.stages,
      anomalyCount: smart.anomalies.total,
      riskSignals: smart.riskEngine.topSignals,
      funderForecasts: smart.financialForecast.topFunderReturns,
      realNetProfit30d: smart.operations.realNetProfit30d,
    },
  });
}
