const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const BASE_URL = process.env.REGRESSION_BASE_URL || "http://127.0.0.1:3001";
const SIGNATURE_DATA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sM9lV4AAAAASUVORK5CYII=";

class CookieJar {
  constructor(name) {
    this.name = name;
    this.cookies = new Map();
  }

  apply(headers) {
    if (!this.cookies.size) return;
    headers.cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  absorb(response) {
    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) return;

    const firstPair = setCookie.split(",").map((part) => part.trim()).filter(Boolean);
    for (const item of firstPair) {
      const segment = item.split(";")[0];
      const eqIndex = segment.indexOf("=");
      if (eqIndex <= 0) continue;
      const key = segment.slice(0, eqIndex).trim();
      const value = segment.slice(eqIndex + 1).trim();
      if (key) this.cookies.set(key, value);
    }
  }
}

async function request(jar, path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  jar?.apply(headers);

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  jar?.absorb(response);

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { response, data };
}

async function expectOk(jar, path, options, label) {
  const result = await request(jar, path, options);
  if (!result.response.ok) {
    throw new Error(`${label} failed: ${result.response.status} ${JSON.stringify(result.data)}`);
  }
  return result.data;
}

async function expectStatus(jar, path, options, expectedStatus, label) {
  const result = await request(jar, path, options);
  if (result.response.status !== expectedStatus) {
    throw new Error(
      `${label} failed: expected ${expectedStatus}, got ${result.response.status} ${JSON.stringify(result.data)}`
    );
  }
  return result.data;
}

async function loginAdmin(username, password) {
  const jar = new CookieJar(username);
  await expectOk(
    jar,
    "/api/auth/admin/login",
    { method: "POST", body: { username, password } },
    `admin login (${username})`
  );
  return jar;
}

async function loginClient(phone, password) {
  const jar = new CookieJar(phone);
  await expectOk(
    jar,
    "/api/auth/client/login",
    { method: "POST", body: { phone, password } },
    `client login (${phone})`
  );
  return jar;
}

async function loginFunder(phone, password) {
  const jar = new CookieJar(phone);
  await expectOk(
    jar,
    "/api/auth/funder/login",
    { method: "POST", body: { phone, password } },
    `funder login (${phone})`
  );
  return jar;
}

async function runParallelSmokeChecks(context) {
  const [operatorJar, funderPrimaryJar, funderMonthlyJar, funderVolumeJar] = await Promise.all([
    loginAdmin("operator", "operator123"),
    loginFunder("13900000001", "funder123"),
    loginFunder("13900000010", "funder123"),
    loginFunder("6973000003", "funder123"),
  ]);

  const checks = [
    {
      role: "admin",
      name: "auth me",
      run: async () => {
        const data = await expectOk(context.adminJar, "/api/auth/me", { method: "GET" }, "admin auth me");
        if (data.portal !== "admin") throw new Error(`admin auth me returned portal ${data.portal}`);
        return { portal: data.portal, username: data.username };
      },
    },
    {
      role: "manager",
      name: "loan detail",
      run: async () => {
        const data = await expectOk(
          context.managerJar,
          `/api/loan-applications/${context.applicationId}`,
          { method: "GET" },
          "manager loan detail"
        );
        return { status: data.status, applicationNo: data.applicationNo };
      },
    },
    {
      role: "manager",
      name: "users forbidden",
      run: async () => {
        await expectStatus(context.managerJar, "/api/users", { method: "GET" }, 403, "manager users forbidden");
        return { status: 403 };
      },
    },
    {
      role: "finance",
      name: "settlement summary",
      run: async () => {
        const data = await expectOk(
          context.financeJar,
          "/api/settlement?type=summary",
          { method: "GET" },
          "finance settlement summary"
        );
        return { disbursedCount: data.disbursedCount, repaidCount: data.repaidCount };
      },
    },
    {
      role: "operator",
      name: "disbursements list",
      run: async () => {
        const data = await expectOk(operatorJar, "/api/disbursements", { method: "GET" }, "operator disbursements list");
        return { total: data.pagination?.total ?? data.total ?? null };
      },
    },
    {
      role: "operator",
      name: "settlement forbidden",
      run: async () => {
        await expectStatus(operatorJar, "/api/settlement?type=summary", { method: "GET" }, 403, "operator settlement forbidden");
        return { status: 403 };
      },
    },
    {
      role: "client",
      name: "auth me",
      run: async () => {
        const data = await expectOk(context.clientJar, "/api/auth/me", { method: "GET" }, "client auth me");
        if (data.portal !== "client") throw new Error(`client auth me returned portal ${data.portal}`);
        return { portal: data.portal, phone: data.phone };
      },
    },
    {
      role: "client",
      name: "admin api unauthorized",
      run: async () => {
        await expectStatus(context.clientJar, "/api/users", { method: "GET" }, 401, "client users unauthorized");
        return { status: 401 };
      },
    },
    {
      role: "funder-primary",
      name: "dashboard",
      run: async () => {
        const data = await expectOk(funderPrimaryJar, "/api/funder/dashboard", { method: "GET" }, "funder primary dashboard");
        return { funderName: data.funder?.name, mode: data.funder?.cooperationMode };
      },
    },
    {
      role: "funder-monthly",
      name: "withdrawals",
      run: async () => {
        const data = await expectOk(funderMonthlyJar, "/api/funder/withdrawals", { method: "GET" }, "funder monthly withdrawals");
        return {
          withdrawableInterest: data.withdrawableInterest,
          withdrawablePrincipal: data.withdrawablePrincipal,
        };
      },
    },
    {
      role: "funder-volume",
      name: "notifications",
      run: async () => {
        const data = await expectOk(funderVolumeJar, "/api/funder/notifications", { method: "GET" }, "funder volume notifications");
        return { unread: data.unread, count: data.notifications?.length ?? 0 };
      },
    },
    {
      role: "funder-volume",
      name: "admin api unauthorized",
      run: async () => {
        await expectStatus(funderVolumeJar, "/api/users", { method: "GET" }, 401, "funder users unauthorized");
        return { status: 401 };
      },
    },
  ];

  const results = await Promise.all(
    checks.map(async (check) => ({
      role: check.role,
      name: check.name,
      result: await check.run(),
    }))
  );

  return {
    totalChecks: results.length,
    rolesCovered: [...new Set(results.map((item) => item.role))],
    checks: results,
  };
}

async function main() {
  const tag = `REG-${Date.now()}`;
  const summary = { tag, baseUrl: BASE_URL };

  const customer = await prisma.customer.findFirst({
    where: { phone: "13800000001", deletedAt: null },
    select: { id: true, name: true, phone: true },
  });
  const product = await prisma.loanProduct.findFirst({
    where: { code: "FULL_AMOUNT_7D", deletedAt: null },
    select: { id: true, code: true, name: true },
  });

  if (!customer) throw new Error("Missing seeded customer 13800000001");
  if (!product) throw new Error("Missing seeded product FULL_AMOUNT_7D");

  const adminJar = await loginAdmin("admin", "Wanjin888@");
  const managerJar = await loginAdmin("manager", "manager123");
  const financeJar = await loginAdmin("finance", "finance123");
  const clientJar = await loginClient(customer.phone, "customer123");

  const created = await expectOk(
    adminJar,
    "/api/loan-applications",
    {
      method: "POST",
      body: {
        customerId: customer.id,
        productId: product.id,
        amount: 1200,
        termValue: 7,
        termUnit: "DAY",
        purpose: `Regression ${tag}`,
        remark: `Regression flow ${tag}`,
      },
    },
    "create loan application"
  );
  summary.applicationId = created.id;

  await expectOk(adminJar, `/api/loan-applications/${created.id}/submit`, { method: "POST" }, "submit loan");
  await expectOk(
    managerJar,
    `/api/loan-applications/${created.id}/risk`,
    { method: "POST", body: { action: "PASS", riskScore: 88, comment: `risk ${tag}` } },
    "risk pass"
  );
  await expectOk(
    managerJar,
    `/api/loan-applications/${created.id}/approve`,
    { method: "POST", body: { action: "APPROVE", approvedAmount: 1200, comment: `approve ${tag}` } },
    "approve loan"
  );

  const generated = await expectOk(
    managerJar,
    "/api/contracts/generate",
    {
      method: "POST",
      body: {
        applicationId: created.id,
        basePrincipal: 1000,
        capitalizedInterestAmount: 200,
        contractPrincipal: 1200,
        contractDisplayInterestRate: "2%",
        weeklyInterestAmount: "500.00",
        monthlyInterestAmount: "2000.00",
      },
    },
    "generate contract"
  );

  const contractId = generated.contract?.id;
  if (!contractId) throw new Error(`generate contract missing id: ${JSON.stringify(generated)}`);
  summary.contractId = contractId;

  await expectOk(
    clientJar,
    `/api/contracts/${contractId}/sign`,
    {
      method: "POST",
      body: {
        signatureData: SIGNATURE_DATA,
        signerType: "customer",
        signerName: customer.name,
        signChannel: "mobile-direct",
        confirmations: {
          readAllTerms: true,
          confirmCapitalizedInterest: true,
          confirmLegalFee: true,
        },
      },
    },
    "sign contract"
  );

  const disbursement = await expectOk(
    financeJar,
    "/api/disbursements",
    {
      method: "POST",
      headers: { "x-idempotency-key": `disb-${tag}` },
      body: {
        applicationId: created.id,
        amount: 1200,
        feeAmount: 0,
        remark: `finance disbursement ${tag}`,
      },
    },
    "create disbursement"
  );
  summary.disbursementId = disbursement.id;

  await expectOk(financeJar, `/api/disbursements/${disbursement.id}/confirm-paid`, { method: "POST" }, "confirm paid");
  await expectOk(
    clientJar,
    `/api/client/disbursements/${disbursement.id}/confirm-received`,
    { method: "POST" },
    "client confirm received"
  );

  const plan = await prisma.repaymentPlan.findFirst({
    where: { applicationId: created.id },
    include: {
      scheduleItems: {
        orderBy: { periodNumber: "asc" },
      },
    },
  });

  if (!plan || !plan.scheduleItems.length) {
    throw new Error("Repayment plan was not generated after disbursement");
  }

  const item = plan.scheduleItems[0];
  const repayment = await expectOk(
    financeJar,
    "/api/repayments",
    {
      method: "POST",
      body: {
        planId: plan.id,
        amount: Number(item.remaining),
        paymentMethod: "BANK_TRANSFER",
        remark: `repayment ${tag}`,
      },
    },
    "create repayment"
  );
  summary.repaymentId = repayment.id;

  await expectOk(
    financeJar,
    `/api/repayments/${repayment.id}/allocate`,
    {
      method: "POST",
      body: {
        allocations: [
          {
            itemId: item.id,
            amount: Number(item.remaining),
            type: "PRINCIPAL",
          },
        ],
        comment: `allocate ${tag}`,
      },
    },
    "allocate repayment"
  );

  await expectOk(
    clientJar,
    `/api/client/repayments/${repayment.id}/confirm`,
    {
      method: "POST",
      body: {
        action: "DECLARED_PAID",
        signatureData: SIGNATURE_DATA,
        deviceInfo: "regression-script",
      },
    },
    "client confirm repayment"
  );

  await expectOk(
    financeJar,
    `/api/repayments/${repayment.id}/confirm`,
    { method: "POST", body: { action: "RECEIVED" } },
    "finance confirm repayment received"
  );

  const settlement = await expectOk(
    financeJar,
    "/api/settlement?type=summary",
    { method: "GET" },
    "settlement summary"
  );

  const [finalApplication, finalPlan] = await Promise.all([
    prisma.loanApplication.findUnique({
      where: { id: created.id },
      include: {
        disbursement: true,
        contracts: true,
      },
    }),
    prisma.repaymentPlan.findFirst({
      where: { applicationId: created.id },
      include: {
        repayments: true,
        scheduleItems: true,
      },
    }),
  ]);

  if (!finalApplication) throw new Error("Application disappeared during regression flow");
  if (!finalPlan) throw new Error("Repayment plan disappeared during regression flow");
  if (finalApplication.status !== "SETTLED") {
    throw new Error(`Expected application to be SETTLED, got ${finalApplication.status}`);
  }

  summary.finalStatus = finalApplication.status;
  summary.contractStatus = finalApplication.contracts[0]?.status || null;
  summary.disbursementStatus = finalApplication.disbursement?.status || null;
  summary.planStatus = finalPlan.status;
  summary.repaymentStatus = finalPlan.repayments[0]?.status || null;
  summary.scheduleItemStatus = finalPlan.scheduleItems[0]?.status || null;
  summary.settlementSnapshot = {
    disbursedCount: settlement.disbursedCount,
    repaidCount: settlement.repaidCount,
    totalIncome: settlement.totalIncome,
    netProfit: settlement.netProfit,
  };
  summary.smoke = await runParallelSmokeChecks({
    adminJar,
    managerJar,
    financeJar,
    clientJar,
    applicationId: created.id,
  });

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("[full-regression] FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
