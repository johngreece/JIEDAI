import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function parseJson(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await requirePermission(["audit:view"]);
  if (session instanceof Response) return session;

  const item = await prisma.messageDelivery.findUnique({
    where: { id: params.id },
    include: {
      attempts: {
        orderBy: [{ attemptNo: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!item) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...item,
    payload: parseJson(item.payloadJson),
    metadata: parseJson(item.metadataJson),
    response: parseJson(item.responseJson),
    attempts: item.attempts.map((attempt) => ({
      ...attempt,
      request: parseJson(attempt.requestJson),
      response: parseJson(attempt.responseJson),
    })),
  });
}
