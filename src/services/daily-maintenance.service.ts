import { ClientNotificationService } from "./client-notification.service";
import { FunderInterestSettlementService } from "./funder-interest-settlement.service";
import { FunderNotificationService } from "./funder-notification.service";
import { FinanceReconciliationService } from "./finance-reconciliation.service";
import { MessageDeliveryService } from "./message-delivery.service";
import { scanOverdueItems } from "./overdue.service";

export type DailyMaintenanceStageName =
  | "overdue"
  | "funderInterestSettlements"
  | "financeReconciliation"
  | "clientNotifications"
  | "funderNotifications"
  | "messageRetryQueue";

export type DailyMaintenanceStageResult = {
  name: DailyMaintenanceStageName;
  status: "success" | "failed";
  durationMs: number;
  result?: unknown;
  error?: string;
};

export type DailyMaintenanceDependencies = {
  scanOverdue: () => Promise<unknown>;
  generateFunderInterestSettlements: () => Promise<unknown>;
  runFinanceReconciliation: () => Promise<unknown>;
  scanClientNotifications: () => Promise<unknown>;
  scanFunderNotifications: () => Promise<unknown>;
  processMessageRetryQueue: () => Promise<unknown>;
};

const defaultDependencies: DailyMaintenanceDependencies = {
  scanOverdue: () => scanOverdueItems(),
  generateFunderInterestSettlements: () =>
    FunderInterestSettlementService.generateDueSettlements(),
  runFinanceReconciliation: () => FinanceReconciliationService.runDailyOrThrow(),
  scanClientNotifications: () => ClientNotificationService.scanAll(),
  scanFunderNotifications: () => FunderNotificationService.scanInterestMaturity(),
  processMessageRetryQueue: () => MessageDeliveryService.processRetryQueue(100),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runStage(
  name: DailyMaintenanceStageName,
  action: () => Promise<unknown>
): Promise<DailyMaintenanceStageResult> {
  const startedAt = Date.now();
  try {
    const result = await action();
    return {
      name,
      status: "success",
      durationMs: Date.now() - startedAt,
      result,
    };
  } catch (error) {
    console.error(`[daily-maintenance] ${name} failed`, error);
    return {
      name,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: errorMessage(error),
    };
  }
}

export async function runDailyMaintenance(
  dependencies: DailyMaintenanceDependencies = defaultDependencies
) {
  const startedAt = new Date();
  const stages: DailyMaintenanceStageResult[] = [];

  stages.push(await runStage("overdue", dependencies.scanOverdue));
  stages.push(
    await runStage(
      "funderInterestSettlements",
      dependencies.generateFunderInterestSettlements
    )
  );
  stages.push(
    await runStage("financeReconciliation", dependencies.runFinanceReconciliation)
  );
  stages.push(
    await runStage("clientNotifications", dependencies.scanClientNotifications)
  );
  stages.push(
    await runStage("funderNotifications", dependencies.scanFunderNotifications)
  );
  stages.push(
    await runStage("messageRetryQueue", dependencies.processMessageRetryQueue)
  );

  return {
    success: stages.every((stage) => stage.status === "success"),
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    stages,
  };
}
