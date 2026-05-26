export const REQUIRED_CLIENT_DOCUMENT_TYPES = [
  "CHINA_ID",
  "PASSPORT",
  "GREEK_RESIDENCE_PERMIT",
] as const;

export const CLIENT_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  CHINA_ID: "身份证复印件",
  PASSPORT: "护照复印件",
  GREEK_RESIDENCE_PERMIT: "居留卡复印件",
};

export const REQUIRED_CLIENT_PROFILE_FIELDS = [
  { key: "phone", label: "电话" },
  { key: "address", label: "地址" },
  { key: "taxNumber", label: "税号" },
  { key: "idNumber", label: "身份证号" },
  { key: "passportNumber", label: "护照号" },
  { key: "residencePermitNumber", label: "居留卡号" },
  { key: "residencePermitExpiry", label: "居留有效期" },
] as const;

export type RequiredClientProfileFieldKey =
  (typeof REQUIRED_CLIENT_PROFILE_FIELDS)[number]["key"];

export type ClientProfileDocument = {
  kycType: string;
  documentUrl?: string | null;
  status?: string | null;
  expiresAt?: Date | string | null;
};

export type ClientProfileRecord = {
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  idNumber?: string | null;
  passportNumber?: string | null;
  residencePermitNumber?: string | null;
  residencePermitExpiry?: Date | string | null;
  profileCompletedAt?: Date | string | null;
  kyc?: ClientProfileDocument[];
};

function hasText(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isFutureOrToday(value: Date | string | null | undefined, now: Date) {
  const date = toDate(value);
  if (!date) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized >= today;
}

function isValidDocument(document: ClientProfileDocument, now: Date) {
  const expiresAt = toDate(document.expiresAt);
  return (
    hasText(document.documentUrl) &&
    document.status !== "REJECTED" &&
    (!expiresAt || expiresAt >= now)
  );
}

export function getClientProfileCompletion(
  customer: ClientProfileRecord,
  now = new Date()
) {
  const missingFields = REQUIRED_CLIENT_PROFILE_FIELDS.filter((field) => {
    if (field.key === "residencePermitExpiry") {
      return !isFutureOrToday(customer.residencePermitExpiry, now);
    }
    return !hasText(customer[field.key]);
  }).map((field) => ({ key: field.key, label: field.label }));

  const validDocumentTypes = new Set(
    (customer.kyc ?? [])
      .filter((document) => isValidDocument(document, now))
      .map((document) => document.kycType)
  );

  const missingDocTypes = REQUIRED_CLIENT_DOCUMENT_TYPES.filter(
    (type) => !validDocumentTypes.has(type)
  ).map((type) => ({
    type,
    label: CLIENT_DOCUMENT_TYPE_LABELS[type],
  }));

  const profileFieldsComplete = missingFields.length === 0;
  const documentsComplete = missingDocTypes.length === 0;

  return {
    profileFieldsComplete,
    documentsComplete,
    profileComplete: profileFieldsComplete && documentsComplete,
    missingFields,
    missingDocTypes,
    validDocumentTypes,
  };
}

export type ClientProfileCompletion = ReturnType<typeof getClientProfileCompletion>;

export function describeClientProfileMissing(completion: ClientProfileCompletion) {
  const parts: string[] = [];

  if (completion.missingFields.length > 0) {
    parts.push(`缺少资料：${completion.missingFields.map((item) => item.label).join("、")}`);
  }

  if (completion.missingDocTypes.length > 0) {
    parts.push(`缺少复印件：${completion.missingDocTypes.map((item) => item.label).join("、")}`);
  }

  return parts;
}

export function formatClientProfileCompletionError(
  completion: ClientProfileCompletion,
  prefix = "客户资料未完善"
) {
  const details = describeClientProfileMissing(completion);
  return details.length > 0 ? `${prefix}：${details.join("；")}` : prefix;
}

export function serializeClientProfileCompletion(completion: ClientProfileCompletion) {
  return {
    profileFieldsComplete: completion.profileFieldsComplete,
    documentsComplete: completion.documentsComplete,
    profileComplete: completion.profileComplete,
    missingFields: completion.missingFields,
    missingDocTypes: completion.missingDocTypes,
    validDocumentTypes: Array.from(completion.validDocumentTypes),
    issueLabels: describeClientProfileMissing(completion),
  };
}

export function resolveProfileCompletedAt(
  customer: ClientProfileRecord,
  profileComplete: boolean,
  now = new Date()
) {
  if (!profileComplete) return null;
  return customer.profileCompletedAt ? toDate(customer.profileCompletedAt) ?? now : now;
}
