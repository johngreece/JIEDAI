import { describe, expect, it } from "vitest";
import { getClientProfileCompletion } from "./client-profile";

const now = new Date("2026-05-26T12:00:00.000Z");

const completeProfile = {
  phone: "+306900000000",
  address: "Athens",
  taxNumber: "AFM123456",
  idNumber: "ID123456",
  passportNumber: "P123456",
  residencePermitNumber: "RP123456",
  residencePermitExpiry: "2027-01-01",
  kyc: [
    { kycType: "CHINA_ID", documentUrl: "data:image/png;base64,a", status: "VERIFIED" },
    { kycType: "PASSPORT", documentUrl: "data:image/png;base64,b", status: "VERIFIED" },
    { kycType: "GREEK_RESIDENCE_PERMIT", documentUrl: "data:image/png;base64,c", status: "VERIFIED" },
  ],
};

describe("getClientProfileCompletion", () => {
  it("requires all identity fields and all document copies", () => {
    const result = getClientProfileCompletion(
      {
        ...completeProfile,
        taxNumber: "",
        kyc: completeProfile.kyc.slice(0, 2),
      },
      now
    );

    expect(result.profileComplete).toBe(false);
    expect(result.missingFields).toEqual([{ key: "taxNumber", label: "税号" }]);
    expect(result.missingDocTypes).toEqual([
      { type: "GREEK_RESIDENCE_PERMIT", label: "居留卡复印件" },
    ]);
  });

  it("treats pending, rejected, or expired documents as incomplete", () => {
    const result = getClientProfileCompletion(
      {
        ...completeProfile,
        kyc: [
          { kycType: "CHINA_ID", documentUrl: "data:image/png;base64,a", status: "REJECTED" },
          { kycType: "PASSPORT", documentUrl: "data:image/png;base64,b", status: "UPLOADED", expiresAt: "2026-05-25" },
          { kycType: "GREEK_RESIDENCE_PERMIT", documentUrl: "data:image/png;base64,c", status: "UPLOADED" },
        ],
      },
      now
    );

    expect(result.documentsComplete).toBe(false);
    expect(result.documentsUploaded).toBe(true);
    expect(result.missingDocTypes.map((item) => item.type)).toEqual([
      "CHINA_ID",
      "PASSPORT",
      "GREEK_RESIDENCE_PERMIT",
    ]);
    expect(result.documentIssues).toEqual([
      { type: "CHINA_ID", label: "身份证复印件", reason: "REJECTED" },
      { type: "PASSPORT", label: "护照复印件", reason: "EXPIRED" },
      { type: "GREEK_RESIDENCE_PERMIT", label: "居留卡复印件", reason: "PENDING" },
    ]);
  });

  it("does not treat uploaded documents as verified", () => {
    const result = getClientProfileCompletion(
      {
        ...completeProfile,
        kyc: completeProfile.kyc.map((document) => ({
          ...document,
          status: "UPLOADED",
        })),
      },
      now
    );

    expect(result.documentsUploaded).toBe(true);
    expect(result.documentsComplete).toBe(false);
    expect(result.profileComplete).toBe(false);
    expect(result.uploadedDocumentTypes.size).toBe(3);
    expect(result.verifiedDocumentTypes.size).toBe(0);
  });

  it("passes when every required field and document is valid", () => {
    const result = getClientProfileCompletion(
      {
        ...completeProfile,
        kyc: completeProfile.kyc.map((document, index) =>
          index === 0 ? { ...document, expiresAt: "2026-05-26" } : document
        ),
      },
      now
    );

    expect(result.profileFieldsComplete).toBe(true);
    expect(result.documentsComplete).toBe(true);
    expect(result.profileComplete).toBe(true);
  });
});
