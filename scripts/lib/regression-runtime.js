"use strict";

const crypto = require("node:crypto");

const REGRESSION_MUTATION_CONFIRMATION = "I_UNDERSTAND_THIS_WRITES_TEST_DATA";

function parseDatabaseIdentity(value, variableName) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL`);
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${variableName} must use the postgresql protocol`);
  }

  const hostname = url.hostname.toLowerCase();
  const username = decodeURIComponent(url.username).toLowerCase();
  const database = decodeURIComponent(url.pathname.replace(/^\//, "") || "postgres").toLowerCase();
  let projectRef = null;

  const directMatch = hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/);
  if (directMatch) projectRef = directMatch[1];

  const poolerMatch = username.match(/^postgres\.([a-z0-9-]+)$/);
  if (poolerMatch) projectRef = poolerMatch[1];

  if (hostname.endsWith(".pooler.supabase.com") && !projectRef) {
    throw new Error(`${variableName} Supabase pooler URL must include postgres.[PROJECT-REF] as its username`);
  }

  if (projectRef) return `supabase:${projectRef}:${database}`;

  const port = url.port || "5432";
  return `postgres:${hostname}:${port}:${database}`;
}

function requireIsolatedRegressionDatabase(env = process.env) {
  if (env.ALLOW_REGRESSION_FIXTURES !== REGRESSION_MUTATION_CONFIRMATION) {
    throw new Error(
      `Refusing to write regression fixtures. Set ALLOW_REGRESSION_FIXTURES=${REGRESSION_MUTATION_CONFIRMATION} only for an isolated test database.`,
    );
  }

  const regressionUrl = env.REGRESSION_DATABASE_URL?.trim();
  if (!regressionUrl) {
    throw new Error("REGRESSION_DATABASE_URL is required for tests that write fixtures");
  }

  const regressionIdentity = parseDatabaseIdentity(regressionUrl, "REGRESSION_DATABASE_URL");
  for (const [name, value] of [
    ["DATABASE_URL", env.DATABASE_URL],
    ["DIRECT_URL", env.DIRECT_URL],
  ]) {
    if (!value?.trim()) continue;
    const primaryIdentity = parseDatabaseIdentity(value.trim(), name);
    if (primaryIdentity === regressionIdentity) {
      throw new Error(`REGRESSION_DATABASE_URL must not point to the same database as ${name}`);
    }
  }

  return regressionUrl;
}

function buildRegressionServerEnvironment(regressionUrl, env = process.env) {
  return {
    ...env,
    DATABASE_URL: regressionUrl,
    DIRECT_URL: regressionUrl,
  };
}

function createRuntimePassword() {
  return `T9!${crypto.randomBytes(18).toString("base64url")}a`;
}

function fixtureUsername(roleCode, tag) {
  const suffix = String(tag).replace(/[^a-zA-Z0-9]/g, "").slice(-8).toLowerCase();
  const role = roleCode.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase();
  const random = crypto.randomBytes(3).toString("hex");
  return `reg_${role}_${suffix}_${random}`;
}

async function createRegressionUsers({ prisma, bcrypt, tag, roleCodes }) {
  const uniqueRoleCodes = [...new Set(roleCodes)];
  const roles = await prisma.role.findMany({
    where: { code: { in: uniqueRoleCodes } },
    select: { id: true, code: true },
  });
  const roleByCode = new Map(roles.map((role) => [role.code, role]));
  const missingRoles = uniqueRoleCodes.filter((code) => !roleByCode.has(code));
  if (missingRoles.length) {
    throw new Error(`Regression database is missing seeded roles: ${missingRoles.join(", ")}`);
  }

  const fixtures = await Promise.all(
    uniqueRoleCodes.map(async (roleCode) => {
      const password = createRuntimePassword();
      return {
        roleCode,
        password,
        passwordHash: await bcrypt.hash(password, 10),
        username: fixtureUsername(roleCode, tag),
      };
    }),
  );

  const created = await prisma.$transaction(async (tx) =>
    Promise.all(
      fixtures.map(async (fixture) => {
        const user = await tx.user.create({
          data: {
            username: fixture.username,
            passwordHash: fixture.passwordHash,
            realName: `Regression ${fixture.roleCode}`,
            roleId: roleByCode.get(fixture.roleCode).id,
            isActive: true,
          },
          select: { id: true, username: true },
        });
        return {
          ...user,
          password: fixture.password,
          roleCode: fixture.roleCode,
        };
      }),
    ),
  );

  return Object.fromEntries(created.map((fixture) => [fixture.roleCode, fixture]));
}

async function deactivateRegressionUsers(prisma, userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return 0;

  const result = await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { isActive: false, deletedAt: new Date() },
  });
  return result.count;
}

module.exports = {
  REGRESSION_MUTATION_CONFIRMATION,
  buildRegressionServerEnvironment,
  createRegressionUsers,
  createRuntimePassword,
  deactivateRegressionUsers,
  parseDatabaseIdentity,
  requireIsolatedRegressionDatabase,
};
