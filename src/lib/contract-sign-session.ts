import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "loan-system-secret-change-in-production"
);

export type ContractSignAccessPayload = {
  purpose: "contract_sign_access";
  contractId: string;
  customerId: string;
  portal: "client";
  iat?: number;
  exp?: number;
};

export async function createContractSignAccessToken(params: {
  contractId: string;
  customerId: string;
}) {
  return new SignJWT({
    purpose: "contract_sign_access",
    contractId: params.contractId,
    customerId: params.customerId,
    portal: "client",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(JWT_SECRET);
}

export async function verifyContractSignAccessToken(token: string) {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  const parsed = payload as unknown as ContractSignAccessPayload;

  if (parsed.purpose !== "contract_sign_access" || parsed.portal !== "client") {
    throw new Error("Invalid contract sign token");
  }

  return parsed;
}
