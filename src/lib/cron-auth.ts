import { NextResponse } from "next/server";

/**
 * 校验 cron 路由调用权限：必须携带 Authorization: Bearer ${CRON_SECRET}。
 * - CRON_SECRET 未设置时拒绝（fail-closed），避免生产环境裸奔。
 * - 校验通过返回 null；失败返回可直接 return 的 401 响应。
 *
 * Vercel Cron 会自动注入 Authorization 头：
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 */
export function ensureCronAuthorized(req: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.trim() === "") {
    return NextResponse.json(
      { error: "CRON_SECRET 未配置，cron 接口拒绝执行" },
      { status: 503 }
    );
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
