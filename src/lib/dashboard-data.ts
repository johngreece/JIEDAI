import { unstable_cache } from "next/cache";

import { DashboardService } from "@/services/dashboard.service";
import { SmartDashboardService } from "@/services/smart-dashboard.service";

const getCachedDashboardSummary = unstable_cache(
  async () => DashboardService.getSummary(),
  ["dashboard-summary"],
  {
    revalidate: 15,
    tags: ["dashboard-summary"],
  },
);

const getCachedSmartDashboard = unstable_cache(
  async () => SmartDashboardService.getSmartData(),
  ["dashboard-smart"],
  {
    revalidate: 15,
    tags: ["dashboard-smart"],
  },
);

export async function getDashboardSummaryData() {
  return getCachedDashboardSummary();
}

export async function getSmartDashboardData() {
  return getCachedSmartDashboard();
}
