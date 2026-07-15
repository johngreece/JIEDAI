import { getSession } from "@/lib/auth";
import { readPrivateFile, privateStorageErrorResponse } from "@/lib/private-file-storage";
import { ensureActiveFunderSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^a-zA-Z0-9._-]/g, "-") || "attachment";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.portal === "client") return Response.json({ error: "Forbidden" }, { status: 403 });

  if (session.portal === "funder") {
    const active = await ensureActiveFunderSession(session);
    if (active instanceof Response) return active;
  }

  const { id } = await params;
  const attachment = await prisma.attachment.findFirst({
    where: {
      id,
      entityType: { in: ["capital_inflow", "disbursement", "funder_withdrawal"] },
      deletedAt: null,
    },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      fileName: true,
      fileUrl: true,
      mimeType: true,
    },
  });
  if (!attachment) return Response.json({ error: "附件不存在" }, { status: 404 });

  if (session.portal === "admin") {
    const requiredPermission =
      attachment.entityType === "funder_withdrawal"
        ? "withdrawal:view"
        : attachment.entityType === "capital_inflow"
          ? "inflow:view"
          : "ledger:view";
    const permission = await requirePermission([requiredPermission]);
    if (permission instanceof Response) return permission;
  }

  if (session.portal === "funder") {
    const ownedEntity =
      attachment.entityType === "capital_inflow"
        ? await prisma.capitalInflow.findFirst({
            where: { id: attachment.entityId, fundAccount: { funderId: session.sub } },
            select: { id: true },
          })
        : attachment.entityType === "disbursement"
          ? await prisma.disbursement.findFirst({
              where: { id: attachment.entityId, fundAccount: { funderId: session.sub } },
              select: { id: true },
            })
          : await prisma.funderWithdrawal.findFirst({
              where: { id: attachment.entityId, funderId: session.sub },
              select: { id: true },
            });
    if (!ownedEntity) return Response.json({ error: "附件不存在" }, { status: 404 });
  }

  if (/^https?:\/\//i.test(attachment.fileUrl)) {
    try {
      const externalUrl = new URL(attachment.fileUrl);
      if (!["http:", "https:"].includes(externalUrl.protocol)) throw new Error("UNSUPPORTED_URL");
      return Response.redirect(externalUrl, 307);
    } catch {
      return Response.json({ error: "附件链接无效" }, { status: 422 });
    }
  }

  try {
    const file = await readPrivateFile(attachment.fileUrl);
    return new Response(file.bytes, {
      headers: {
        "content-type": file.contentType || attachment.mimeType,
        "content-disposition": contentDisposition(attachment.fileName),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return privateStorageErrorResponse(error, "附件读取失败");
  }
}
