import { getSession } from "@/lib/auth";
import {
  getFileExtension,
  privateStorageErrorResponse,
  readPrivateFile,
} from "@/lib/private-file-storage";
import { ensureActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.portal === "funder") return Response.json({ error: "Forbidden" }, { status: 403 });

  if (session.portal === "admin") {
    const permission = await requirePermission(["customer:view"]);
    if (permission instanceof Response) return permission;
  } else {
    const active = await ensureActiveClientSession(session);
    if (active instanceof Response) return active;
  }

  const { id } = await params;
  const document = await prisma.customerKyc.findFirst({
    where: {
      id,
      documentUrl: { not: null },
      ...(session.portal === "client" ? { customerId: session.sub } : {}),
    },
    select: { id: true, kycType: true, documentUrl: true },
  });
  if (!document?.documentUrl) {
    return Response.json({ error: "证件不存在" }, { status: 404 });
  }

  try {
    const file = await readPrivateFile(document.documentUrl);
    const fileName = `${safeFileName(document.kycType)}.${getFileExtension(file.contentType)}`;
    return new Response(file.bytes, {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `inline; filename="${fileName}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return privateStorageErrorResponse(error, "证件读取失败");
  }
}
