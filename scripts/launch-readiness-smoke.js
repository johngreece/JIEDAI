const { spawn } = require("child_process");

const BASE_URL = process.env.REGRESSION_BASE_URL || "http://127.0.0.1:3001";

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
    });
  }

  return spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
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

    const adminJar = new CookieJar("admin");
    await expectOk(
      adminJar,
      "/api/auth/admin/login",
      {
        method: "POST",
        body: { username: "admin", password: "Wanjin888@" },
      },
      "admin login"
    );

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
  }
}

main().catch((error) => {
  console.error("[launch-readiness-smoke] FAILED");
  console.error(error);
  process.exit(1);
});
