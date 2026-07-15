import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatMoney as money } from "@/lib/system-config";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
import { requireActiveFunderSession } from "@/lib/portal-session";
import {
  createProofAttachment,
  serializeProofAttachment,
  storeProofFile,
} from "@/lib/proof-attachment";
import { deletePrivateFile, privateStorageErrorResponse } from "@/lib/private-file-storage";
import { prisma } from "@/lib/prisma";
import { InAppNotificationService } from "@/services/in-app-notification.service";

export const dynamic = "force-dynamic";

const inflowSchema = z.object({
  fundAccountId: z.string().min(1),
  amount: z.coerce.number().positive(),
  channel: z.string().trim().min(1).default("BANK_TRANSFER"),
  inflowDate: z.string().datetime().optional(),
  remark: z.string().trim().max(500).optional(),
  proofUrl: z
    .string()
    .trim()
    .url("凭证链接格式不正确")
    .refine((value) => value.startsWith("https://"), "凭证链接必须使用 HTTPS")
    .optional(),
  proofFileName: z.string().trim().max(160).optional(),
  proofMimeType: z.string().trim().max(100).optional(),
});

type InflowInput = z.infer<typeof inflowSchema>;

async function parseInflowRequest(req: NextRequest): Promise<{
  input: InflowInput;
  proofFile: File | null;
}> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const proofValue = formData.get("proof");
    const raw = {
      fundAccountId: formData.get("fundAccountId"),
      amount: formData.get("amount"),
      channel: formData.get("channel") ?? "BANK_TRANSFER",
      inflowDate: formData.get("inflowDate") || undefined,
      remark: formData.get("remark") || undefined,
      proofUrl: formData.get("proofUrl") || undefined,
      proofFileName: formData.get("proofFileName") || undefined,
      proofMimeType: formData.get("proofMimeType") || undefined,
    };

    return {
      input: inflowSchema.parse(raw),
      proofFile: proofValue && typeof proofValue !== "string" ? proofValue : null,
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    input: inflowSchema.parse(body),
    proofFile: null,
  };
}

export async function GET(req: NextRequest) {
  const session = await requireActiveFunderSession();
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  const [inflows, accounts] = await Promise.all([
    prisma.capitalInflow.findMany({
      where: {
        fundAccount: {
          funderId: session.sub,
        },
      },
      orderBy: { createdAt: "desc" },
      take: Number.isFinite(limit) ? limit : 50,
      include: {
        fundAccount: {
          select: {
            id: true,
            accountName: true,
            bankName: true,
            accountNo: true,
          },
        },
      },
    }),
    prisma.fundAccount.findMany({
      where: {
        funderId: session.sub,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        accountName: true,
        bankName: true,
        accountNo: true,
        balance: true,
      },
    }),
  ]);

  const inflowIds = inflows.map((item) => item.id);
  const attachments = inflowIds.length
    ? await prisma.attachment.findMany({
        where: {
          entityType: "capital_inflow",
          entityId: { in: inflowIds },
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          entityId: true,
          fileName: true,
          fileUrl: true,
          fileSize: true,
          mimeType: true,
          category: true,
          createdAt: true,
        },
      })
    : [];

  const proofsByInflowId = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const current = proofsByInflowId.get(attachment.entityId) ?? [];
    current.push(attachment);
    proofsByInflowId.set(attachment.entityId, current);
  }

  return NextResponse.json({
    accounts: accounts.map((account) => ({
      ...account,
      balance: Number(account.balance),
    })),
    items: inflows.map((item) => ({
      id: item.id,
      amount: Number(item.amount),
      channel: item.channel,
      inflowDate: item.inflowDate,
      status: item.status,
      remark: item.remark,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      fundAccount: item.fundAccount,
      proofs: (proofsByInflowId.get(item.id) ?? []).map(serializeProofAttachment),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireActiveFunderSession();
  if (session instanceof Response) return session;

  const idemKey = getScopedIdempotencyKey(req, ["funder", session.sub, "capital-inflow"]);
  return withIdempotencyResponse(idemKey, async () => {

  let parsed: Awaited<ReturnType<typeof parseInflowRequest>>;
  try {
    parsed = await parseInflowRequest(req);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "参数错误", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "参数错误" }, { status: 400 });
  }

  const { input, proofFile } = parsed;
  if (!proofFile && !input.proofUrl) {
    return NextResponse.json({ error: "请上传入金凭证或提供凭证链接" }, { status: 400 });
  }

  const account = await prisma.fundAccount.findFirst({
    where: {
      id: input.fundAccountId,
      isActive: true,
      funderId: session.sub,
      funder: {
        isActive: true,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      accountName: true,
      bankName: true,
    },
  });

  if (!account) {
    return NextResponse.json({ error: "资金账户不存在或不属于当前资金方" }, { status: 404 });
  }
  const accountId = account.id;
  const funderId = session.sub;

  let fileUrl = input.proofUrl ?? "";
  let fileName = input.proofFileName || "capital-inflow-proof";
  let fileSize = 0;
  let mimeType = input.proofMimeType || "text/uri-list";

  if (proofFile) {
    try {
      fileUrl = await storeProofFile(proofFile, `funders/${session.sub}/inflows`);
      fileName = proofFile.name || fileName;
      fileSize = proofFile.size;
      mimeType = proofFile.type || "application/octet-stream";
    } catch (error) {
      return privateStorageErrorResponse(error, "凭证上传失败");
    }
  }

  const inflowDate = input.inflowDate ? new Date(input.inflowDate) : new Date();

  let result: Awaited<ReturnType<typeof createInflow>>;
  async function createInflow() {
    return prisma.$transaction(async (tx) => {
      const inflow = await tx.capitalInflow.create({
        data: {
          fundAccountId: accountId,
          amount: input.amount,
          channel: input.channel,
          inflowDate,
          status: "PENDING",
          remark: input.remark ?? "资金方自助提交入金申请，待后台确认到账",
        },
      });

      const proof = await createProofAttachment(tx, {
        entityType: "capital_inflow",
        entityId: inflow.id,
        fileName,
        fileUrl,
        fileSize,
        mimeType,
        uploadedBy: `funder:${funderId}`,
        category: "FUNDER_INFLOW_PROOF",
      });

      return { inflow, proof };
    });
  }

  try {
    result = await createInflow();
  } catch (error) {
    if (proofFile) await deletePrivateFile(fileUrl).catch(() => undefined);
    throw error;
  }

  await InAppNotificationService.notifyAdmins({
    type: "FUNDER_CAPITAL_INFLOW_REQUESTED",
    templateCode: `FUNDER_CAPITAL_INFLOW_REQUESTED_${result.inflow.id}`,
    title: "资金方入金申请待确认",
    content: `${session.name} 提交了 ${money(input.amount)} 入金申请，账户 ${account.accountName}，请核对凭证并确认到账。`,
  });

  const responseBody = {
    id: result.inflow.id,
    amount: Number(result.inflow.amount),
    status: result.inflow.status,
    proof: serializeProofAttachment(result.proof),
  };
  return NextResponse.json(responseBody, { status: 201 });
  });
}
