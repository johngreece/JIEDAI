import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";

export const DEFAULT_STORAGE_BUCKET = "internal-files";
const LIST_PAGE_SIZE = 100;

function requiredValue(value, name) {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export function getStorageApiConfig(env = process.env) {
  const baseUrl = requiredValue(
    env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
    "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
  ).replace(/\/+$/, "");
  const serviceRoleKey = requiredValue(
    env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const bucket = (env.SUPABASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET).trim();

  if (!/^https:\/\//i.test(baseUrl)) throw new Error("Supabase URL must use HTTPS");
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(bucket)) {
    throw new Error("SUPABASE_STORAGE_BUCKET has an invalid format");
  }

  return { baseUrl, serviceRoleKey, bucket };
}

export function storageApiHeaders(config, contentType = "application/json") {
  return {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    ...(contentType ? { "content-type": contentType } : {}),
  };
}

export function encodeObjectPath(objectPath) {
  return objectPath.split("/").map(encodeURIComponent).join("/");
}

function validateObjectPath(objectPath) {
  if (typeof objectPath !== "string" || !objectPath || objectPath.includes("\\")) {
    throw new Error(`Unsafe Storage object path: ${JSON.stringify(objectPath)}`);
  }

  const segments = objectPath.split("/");
  if (
    segments.some(
      (segment) =>
        !segment || segment === "." || segment === ".." || segment.includes("\0"),
    )
  ) {
    throw new Error(`Unsafe Storage object path: ${JSON.stringify(objectPath)}`);
  }
  return segments;
}

export function resolveSafeObjectPath(rootDirectory, objectPath) {
  const root = path.resolve(rootDirectory);
  const target = path.resolve(root, ...validateObjectPath(objectPath));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Storage object path escapes the backup directory: ${objectPath}`);
  }
  return target;
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

function objectSize(metadata) {
  const raw = metadata?.size ?? metadata?.contentLength ?? metadata?.content_length;
  if (raw === undefined || raw === null || raw === "") return null;
  const size = Number(raw);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}

function joinObjectPath(prefix, name) {
  if (typeof name !== "string" || !name || name.includes("/") || name.includes("\\")) {
    throw new Error(`Supabase returned an unsafe Storage object name: ${JSON.stringify(name)}`);
  }
  return prefix ? `${prefix}/${name}` : name;
}

async function listPrefix(config, prefix, offset) {
  const response = await fetch(
    `${config.baseUrl}/storage/v1/object/list/${encodeURIComponent(config.bucket)}`,
    {
      method: "POST",
      headers: storageApiHeaders(config),
      body: JSON.stringify({
        prefix,
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Supabase Storage list failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`,
    );
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error("Supabase Storage list returned invalid data");
  return payload;
}

export async function listAllStorageObjects(config) {
  const prefixes = [""];
  const visitedPrefixes = new Set();
  const objectPaths = new Set();
  const objects = [];

  while (prefixes.length > 0) {
    const prefix = prefixes.shift();
    if (visitedPrefixes.has(prefix)) continue;
    visitedPrefixes.add(prefix);

    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const entries = await listPrefix(config, prefix, offset);
      for (const entry of entries) {
        const objectPath = joinObjectPath(prefix, entry?.name);
        resolveSafeObjectPath(process.cwd(), objectPath);

        const isFolder = entry?.id == null && entry?.metadata == null;
        if (isFolder) {
          prefixes.push(objectPath);
          continue;
        }

        if (objectPaths.has(objectPath)) {
          throw new Error(`Supabase returned a duplicate Storage object: ${objectPath}`);
        }
        objectPaths.add(objectPath);
        objects.push({
          path: objectPath,
          listedSize: objectSize(entry?.metadata),
        });
      }

      if (entries.length < LIST_PAGE_SIZE) break;
    }
  }

  return objects.sort((left, right) => left.path.localeCompare(right.path));
}
