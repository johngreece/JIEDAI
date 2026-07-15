const { spawn } = require("child_process");
const bcrypt = require("bcryptjs");
const { loadEnvConfig } = require("@next/env");
const { PrismaClient } = require("@prisma/client");
const {
  buildRegressionServerEnvironment,
  createRegressionUsers,
  createRuntimePassword,
  deactivateRegressionUsers,
  requireIsolatedRegressionDatabase,
} = require("./lib/regression-runtime");

loadEnvConfig(process.cwd());

const regressionDatabaseUrl = requireIsolatedRegressionDatabase(process.env);
process.env.DATABASE_URL = regressionDatabaseUrl;
process.env.DIRECT_URL = regressionDatabaseUrl;

const BASE_URL = process.env.REGRESSION_BASE_URL || "http://127.0.0.1:3001";
const prisma = new PrismaClient({
  datasources: { db: { url: regressionDatabaseUrl } },
});
let regressionUserIds = [];

function buildPhone(prefix, seed) {
  const numeric = String(seed).replace(/\D/g, "").slice(-7).padStart(7, "0");
  return `${prefix}${numeric}`;
}

class CookieJar {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  absorb(response) {
    const setCookie =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie")]
          : [];

    for (const item of setCookie) {
      const pair = item.split(";")[0];
      const [name, value] = pair.split("=");
      if (name && value) {
        this.cookies.set(name.trim(), value.trim());
      }
    }
  }

  header() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function request(jar, path, options = {}) {
  const headers = {
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  const cookie = jar?.header();
  if (cookie) headers.cookie = cookie;

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  jar?.absorb(response);

  const raw = await response.text();
  let body = raw;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = raw;
  }

  return { response, body };
}

async function expectOk(jar, path, options, label) {
  const { response, body } = await request(jar, path, options);
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function createActiveFixture(adminJar, tag, roleUsers) {
  const customerPassword = createRuntimePassword();
  const customerPhone = buildPhone("694", `${Date.now()}1`);
  const customerHash = await bcrypt.hash(customerPassword, 10);

  const customer = await prisma.customer.create({
    data: {
      name: `Launch Fixture ${tag}`,
      phone: customerPhone,
      passwordHash: customerHash,
      idNumber: `LR${Date.now()}${Math.floor(Math.random() * 1000)}`,
      taxNumber: `AFM${Date.now()}`,
      passportNumber: `P${Date.now()}`,
      residencePermitNumber: `RP${Date.now()}`,
      residencePermitExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      profileCompletedAt: new Date(),
      address: "Launch readiness fixture",
    },
    select: { id: true, phone: true, name: true },
  });

  await prisma.customerKyc.createMany({
    data: ["CHINA_ID", "PASSPORT", "GREEK_RESIDENCE_PERMIT"].map((kycType) => ({
      customerId: customer.id,
      kycType,
      documentUrl: `data:image/png;base64,launch-readiness-${kycType}`,
      status: "UPLOADED",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      remark: `Launch readiness ${tag}`,
    })),
  });

  const funderPhone = buildPhone("693", `${Date.now()}2`);
  const funderHash = await bcrypt.hash(createRuntimePassword(), 10);
  const funder = await prisma.funder.create({
    data: {
      name: `Launch Funder ${tag}`,
      type: "COMPANY",
      loginPhone: funderPhone,
      passwordHash: funderHash,
      contactPerson: "Launch Fixture",
      contactPhone: funderPhone,
      cooperationMode: "FIXED_MONTHLY",
      monthlyRate: 1,
      priority: 99,
      isActive: true,
    },
    select: { id: true },
  });

  await prisma.fundAccount.create({
    data: {
      funderId: funder.id,
      accountName: `Launch Account ${tag}`,
      bankName: "Launch Bank",
      accountNo: `LAUNCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      balance: 300000,
      totalInflow: 300000,
    },
  });

  const product = await prisma.loanProduct.findFirst({
    where: { code: "FULL_AMOUNT_7D", deletedAt: null },
    select: { id: true },
  });

  if (!product) {
    throw new Error("Missing product FULL_AMOUNT_7D");
  }

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
        purpose: `Launch readiness ${tag}`,
        remark: `Launch readiness ${tag}`,
      },
    },
    "create launch-readiness loan"
  );

  const managerJar = new CookieJar(roleUsers.manager.username);
  const financeJar = new CookieJar(roleUsers.finance.username);

  await expectOk(managerJar, "/api/auth/admin/login", { method: "POST", body: { username: roleUsers.manager.username, password: roleUsers.manager.password } }, "manager login");
  await expectOk(financeJar, "/api/auth/admin/login", { method: "POST", body: { username: roleUsers.finance.username, password: roleUsers.finance.password } }, "finance login");

  await expectOk(adminJar, `/api/loan-applications/${created.id}/submit`, { method: "POST" }, "submit launch loan");
  await expectOk(managerJar, `/api/loan-applications/${created.id}/risk`, { method: "POST", body: { action: "PASS", riskScore: 85, comment: `launch risk ${tag}` } }, "launch risk");
  await expectOk(managerJar, `/api/loan-applications/${created.id}/approve`, { method: "POST", body: { action: "APPROVE", approvedAmount: 1200, comment: `launch approve ${tag}` } }, "launch approve");
  await expectOk(managerJar, "/api/contracts/generate", {
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
  }, "launch contract");

  const clientJar = new CookieJar(customer.phone);
  await expectOk(clientJar, "/api/auth/client/login", { method: "POST", body: { phone: customer.phone, password: customerPassword } }, "launch client login");
  const contract = await prisma.contract.findFirst({
    where: { applicationId: created.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  await expectOk(clientJar, `/api/contracts/${contract.id}/sign`, {
    method: "POST",
    body: {
      signatureData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sM9lV4AAAAASUVORK5CYII=",
      signerType: "customer",
      signerName: customer.name,
      signChannel: "mobile-direct",
      confirmations: {
        readAllTerms: true,
        confirmCapitalizedInterest: true,
        confirmLegalFee: true,
      },
    },
  }, "launch sign contract");

  const disbursement = await expectOk(financeJar, "/api/disbursements", {
    method: "POST",
    headers: { "x-idempotency-key": `launch-${tag}` },
    body: {
      applicationId: created.id,
      amount: 1200,
      feeAmount: 0,
      remark: `launch disbursement ${tag}`,
    },
  }, "launch disbursement");

  await expectOk(financeJar, `/api/disbursements/${disbursement.id}/confirm-paid`, { method: "POST" }, "launch confirm paid");
  await expectOk(clientJar, `/api/client/disbursements/${disbursement.id}/confirm-received`, { method: "POST" }, "launch confirm received");
}

async function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("dev server start timeout"));
      }
    }, 120000);

    const handleOutput = (chunk) => {
      const text = chunk.toString();
      if (text.includes("Ready in")) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      }
      if (text.includes("EADDRINUSE")) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      }
    };

    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);
    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`dev server exited early: ${code}`));
      }
    });
  });
}

function spawnDevServer() {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/c", "npm run dev"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: buildRegressionServerEnvironment(regressionDatabaseUrl),
    });
  }

  return spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: buildRegressionServerEnvironment(regressionDatabaseUrl),
  });
}

async function stopServer(child) {
  if (!child?.pid) return;

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
      killer.on("exit", resolve);
      killer.on("error", resolve);
    });
    return;
  }

  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGTERM");
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
    }, 5000);
  });
}

async function main() {
  const shouldStartLocalServer = !process.env.REGRESSION_BASE_URL;
  const child = shouldStartLocalServer ? spawnDevServer() : null;

  let output = "";
  child?.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child?.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    if (child) {
      await waitForReady(child);
    }

    const tag = `LR-${Date.now()}`;
    const roleUsers = await createRegressionUsers({
      prisma,
      bcrypt,
      tag,
      roleCodes: ["super_admin", "manager", "finance"],
    });
    regressionUserIds = Object.values(roleUsers).map((user) => user.id);

    const adminJar = new CookieJar(roleUsers.super_admin.username);
    await expectOk(
      adminJar,
      "/api/auth/admin/login",
      {
        method: "POST",
        body: {
          username: roleUsers.super_admin.username,
          password: roleUsers.super_admin.password,
        },
      },
      "admin login"
    );

    await createActiveFixture(adminJar, tag, roleUsers);

    const readiness = await expectOk(
      adminJar,
      "/api/admin/launch-readiness",
      { method: "GET" },
      "launch readiness summary"
    );

    const scenario = await expectOk(
      adminJar,
      "/api/admin/launch-readiness/notification-scenarios",
      { method: "POST" },
      "launch readiness scenario"
    );

    const checks = {
      testClientPhone: readiness.testClient?.phone,
      activeApplication: readiness.activeApplication?.applicationNo || null,
      summaryHealthScore: readiness.smartSummary?.healthScore,
      scenarioStages: scenario.stages?.map((item) => item.stage) || [],
      scenarioNotifications: scenario.notifications?.map((item) => item.type) || [],
    };

    if (!checks.testClientPhone) {
      throw new Error(`missing test client in readiness response: ${JSON.stringify(readiness)}`);
    }
    if (checks.scenarioStages.length !== 6) {
      throw new Error(`unexpected scenario stage count: ${JSON.stringify(checks)}`);
    }
    if (!checks.scenarioNotifications.some((item) => item === "REPAYMENT_OVERDUE")) {
      throw new Error(`missing overdue notification scenario: ${JSON.stringify(checks)}`);
    }

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, checks }, null, 2));
  } finally {
    await stopServer(child);
    await deactivateRegressionUsers(prisma, regressionUserIds);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[launch-readiness-smoke] FAILED");
  console.error(error);
  process.exit(1);
});
