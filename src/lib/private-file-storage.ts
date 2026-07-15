import { randomUUID } from "node:crypto";

export const DEFAULT_PRIVATE_STORAGE_BUCKET = "internal-files";
export const MAX_PRIVATE_FILE_SIZE = 10 * 1024 * 1024;
export const ALLOWED_PRIVATE_FILE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

const STORAGE_PROTOCOL = "supabase-storage:";
const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

type StorageConfig = {
  baseUrl: string;
  serviceRoleKey: string;
  bucket: string;
};

type ParsedStorageReference = {
  bucket: string;
  objectPath: string;
  contentType: string | null;
};

export class PrivateFileValidationError extends Error {}
export class PrivateStorageConfigurationError extends Error {}
export class PrivateStorageOperationError extends Error {}

function isPlaceholder(value: string) {
  return value.includes("[") || value.includes("change-me") || value.includes("eyJhbGci...");
}

export function getPrivateStorageConfig(): StorageConfig {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || DEFAULT_PRIVATE_STORAGE_BUCKET;

  if (!baseUrl || !serviceRoleKey || isPlaceholder(baseUrl) || isPlaceholder(serviceRoleKey)) {
    throw new PrivateStorageConfigurationError(
      "Supabase 私有文件存储未配置，请设置 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  if (!/^https:\/\//i.test(baseUrl)) {
    throw new PrivateStorageConfigurationError("NEXT_PUBLIC_SUPABASE_URL 必须使用 HTTPS");
  }

  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(bucket)) {
    throw new PrivateStorageConfigurationError("SUPABASE_STORAGE_BUCKET 格式不正确");
  }

  return { baseUrl, serviceRoleKey, bucket };
}

function encodeObjectPath(objectPath: string) {
  return objectPath.split("/").map(encodeURIComponent).join("/");
}

function normalizePathPrefix(pathPrefix: string) {
  const normalized = pathPrefix
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-"))
    .filter(Boolean)
    .join("/");

  if (!normalized) {
    throw new PrivateFileValidationError("文件存储路径不能为空");
  }
  return normalized;
}

export function buildPrivateFileReference(
  bucket: string,
  objectPath: string,
  contentType: string,
) {
  const params = new URLSearchParams({ contentType });
  return `${STORAGE_PROTOCOL}//${bucket}/${encodeObjectPath(objectPath)}?${params.toString()}`;
}

export function parsePrivateFileReference(reference: string): ParsedStorageReference | null {
  if (!reference.startsWith(`${STORAGE_PROTOCOL}//`)) return null;

  try {
    const url = new URL(reference);
    if (url.protocol !== STORAGE_PROTOCOL || !url.hostname || !url.pathname.slice(1)) return null;
    return {
      bucket: decodeURIComponent(url.hostname),
      objectPath: url.pathname
        .slice(1)
        .split("/")
        .map(decodeURIComponent)
        .join("/"),
      contentType: url.searchParams.get("contentType"),
    };
  } catch {
    return null;
  }
}

export function getPrivateFileContentType(reference: string | null | undefined) {
  if (!reference) return null;
  const stored = parsePrivateFileReference(reference);
  if (stored?.contentType) return stored.contentType;
  return reference.match(/^data:([^;,]+)[;,]/i)?.[1] ?? null;
}

export function getFileExtension(contentType: string | null | undefined) {
  return MIME_EXTENSION[contentType ?? ""] ?? "bin";
}

export function getCustomerDocumentAccessUrl(documentId: string) {
  return `/api/customer-documents/${encodeURIComponent(documentId)}/file`;
}

export function getAttachmentAccessUrl(attachmentId: string) {
  return `/api/attachments/${encodeURIComponent(attachmentId)}/file`;
}

function storageHeaders(config: StorageConfig, contentType?: string) {
  return {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    ...(contentType ? { "content-type": contentType } : {}),
  };
}

export async function uploadPrivateFile(params: {
  file: File;
  pathPrefix: string;
  maxBytes?: number;
  allowedMimeTypes?: readonly string[];
  label?: string;
}) {
  const {
    file,
    pathPrefix,
    maxBytes = MAX_PRIVATE_FILE_SIZE,
    allowedMimeTypes = ALLOWED_PRIVATE_FILE_MIME_TYPES,
    label = "文件",
  } = params;

  const contentType = file.type.toLowerCase();
  return uploadPrivateBytes({
    bytes: Buffer.from(await file.arrayBuffer()),
    contentType,
    pathPrefix,
    maxBytes,
    allowedMimeTypes,
    label,
  });
}

export async function uploadPrivateBytes(params: {
  bytes: Uint8Array;
  contentType: string;
  pathPrefix: string;
  maxBytes?: number;
  allowedMimeTypes?: readonly string[];
  label?: string;
}) {
  const {
    bytes,
    pathPrefix,
    maxBytes = MAX_PRIVATE_FILE_SIZE,
    allowedMimeTypes = ALLOWED_PRIVATE_FILE_MIME_TYPES,
    label = "文件",
  } = params;
  const contentType = params.contentType.toLowerCase();

  if (bytes.byteLength <= 0) throw new PrivateFileValidationError(`${label}不能为空`);
  if (bytes.byteLength > maxBytes) {
    throw new PrivateFileValidationError(`${label}不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`);
  }

  if (!allowedMimeTypes.includes(contentType)) {
    throw new PrivateFileValidationError(`${label}仅支持 JPG/PNG/WebP/PDF`);
  }

  const config = getPrivateStorageConfig();
  const objectPath = `${normalizePathPrefix(pathPrefix)}/${Date.now()}-${randomUUID()}.${getFileExtension(contentType)}`;
  const response = await fetch(
    `${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeObjectPath(objectPath)}`,
    {
      method: "POST",
      headers: {
        ...storageHeaders(config, contentType),
        "cache-control": "3600",
        "x-upsert": "false",
      },
      body: Buffer.from(bytes),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new PrivateStorageOperationError(
      `Supabase Storage 上传失败（${response.status}）${detail ? `：${detail.slice(0, 180)}` : ""}`,
    );
  }

  return buildPrivateFileReference(config.bucket, objectPath, contentType);
}

export async function deletePrivateFile(reference: string | null | undefined) {
  if (!reference) return;
  const stored = parsePrivateFileReference(reference);
  if (!stored) return;

  const config = getPrivateStorageConfig();
  const response = await fetch(
    `${config.baseUrl}/storage/v1/object/${encodeURIComponent(stored.bucket)}`,
    {
      method: "DELETE",
      headers: storageHeaders(config, "application/json"),
      body: JSON.stringify({ prefixes: [stored.objectPath] }),
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new PrivateStorageOperationError(`Supabase Storage 清理失败（${response.status}）`);
  }
}

export async function readPrivateFile(reference: string) {
  const dataUrl = reference.match(/^data:([^;,]+);base64,([\s\S]*)$/i);
  if (dataUrl) {
    return {
      bytes: Buffer.from(dataUrl[2].replace(/\s/g, ""), "base64"),
      contentType: dataUrl[1],
    };
  }

  const stored = parsePrivateFileReference(reference);
  if (!stored) throw new PrivateStorageOperationError("不支持的私有文件引用");

  const config = getPrivateStorageConfig();
  const response = await fetch(
    `${config.baseUrl}/storage/v1/object/${encodeURIComponent(stored.bucket)}/${encodeObjectPath(stored.objectPath)}`,
    { headers: storageHeaders(config), cache: "no-store" },
  );
  if (!response.ok) {
    throw new PrivateStorageOperationError(`Supabase Storage 读取失败（${response.status}）`);
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || stored.contentType || "application/octet-stream",
  };
}

export function privateStorageErrorResponse(error: unknown, fallback: string) {
  if (error instanceof PrivateFileValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof PrivateStorageConfigurationError) {
    return Response.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof PrivateStorageOperationError) {
    return Response.json({ error: error.message }, { status: 502 });
  }
  return Response.json({ error: fallback }, { status: 500 });
}
