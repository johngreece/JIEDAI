import { loadEnvConfig } from "@next/env";
import {
  ALLOWED_PRIVATE_FILE_MIME_TYPES,
  MAX_PRIVATE_FILE_SIZE,
  getPrivateStorageConfig,
} from "../src/lib/private-file-storage";

loadEnvConfig(process.cwd());

async function main() {
  const config = getPrivateStorageConfig();
  const headers = {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    "content-type": "application/json",
  };
  const bucketUrl = `${config.baseUrl}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`;
  const currentResponse = await fetch(bucketUrl, { headers, cache: "no-store" });

  const payload = {
    id: config.bucket,
    name: config.bucket,
    public: false,
    file_size_limit: MAX_PRIVATE_FILE_SIZE,
    allowed_mime_types: [...ALLOWED_PRIVATE_FILE_MIME_TYPES],
  };

  if (currentResponse.status === 404) {
    const createResponse = await fetch(`${config.baseUrl}/storage/v1/bucket`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!createResponse.ok) {
      throw new Error(`创建 Supabase Storage bucket 失败（${createResponse.status}）`);
    }
    console.log(`Created private Supabase Storage bucket: ${config.bucket}`);
    return;
  }

  if (!currentResponse.ok) {
    throw new Error(`读取 Supabase Storage bucket 失败（${currentResponse.status}）`);
  }

  const updateResponse = await fetch(bucketUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      public: false,
      file_size_limit: MAX_PRIVATE_FILE_SIZE,
      allowed_mime_types: [...ALLOWED_PRIVATE_FILE_MIME_TYPES],
    }),
  });
  if (!updateResponse.ok) {
    throw new Error(`更新 Supabase Storage bucket 失败（${updateResponse.status}）`);
  }
  console.log(`Verified private Supabase Storage bucket: ${config.bucket}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
