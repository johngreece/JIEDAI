import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { MessageDeliveryService } from "@/services/message-delivery.service";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["audit:view"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const result = await MessageDeliveryService.retryDelivery(id);
  return NextResponse.json({ ok: true, result });
}
