import { afterEach, describe, expect, it } from "vitest";
import {
  PrivateStorageConfigurationError,
  buildPrivateFileReference,
  getFileExtension,
  getPrivateFileContentType,
  getPrivateStorageConfig,
  parsePrivateFileReference,
  readPrivateFile,
} from "./private-file-storage";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("private file storage references", () => {
  it("round-trips bucket, object path, and MIME type", () => {
    const reference = buildPrivateFileReference(
      "internal-files",
      "customers/customer-1/kyc/passport/file 1.pdf",
      "application/pdf",
    );

    expect(parsePrivateFileReference(reference)).toEqual({
      bucket: "internal-files",
      objectPath: "customers/customer-1/kyc/passport/file 1.pdf",
      contentType: "application/pdf",
    });
    expect(getPrivateFileContentType(reference)).toBe("application/pdf");
    expect(getFileExtension("application/pdf")).toBe("pdf");
  });

  it("keeps legacy Base64 documents readable without exposing a public URL", async () => {
    const legacy = "data:image/png;base64,aW50ZXJuYWwtZG9jdW1lbnQ=";
    const file = await readPrivateFile(legacy);

    expect(file.contentType).toBe("image/png");
    expect(file.bytes.toString("utf8")).toBe("internal-document");
    expect(getPrivateFileContentType(legacy)).toBe("image/png");
  });

  it("fails closed when server-side Supabase credentials are absent", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => getPrivateStorageConfig()).toThrow(PrivateStorageConfigurationError);
  });
});
