"use strict";

const DEFAULT_ADMIN_USERNAME = "admin";
const LEGACY_PASSWORDS = new Map([
  ["admin", "V2FuamluODg4QA=="],
  ["manager", "bWFuYWdlcjEyMw=="],
  ["finance", "ZmluYW5jZTEyMw=="],
  ["operator", "b3BlcmF0b3IxMjM="],
]);

function legacyPassword(username) {
  const encoded = LEGACY_PASSWORDS.get(username);
  return encoded ? Buffer.from(encoded, "base64").toString("utf8") : null;
}

async function usesLegacyPassword(user, bcrypt) {
  const candidate = legacyPassword(user.username);
  return candidate ? bcrypt.compare(candidate, user.passwordHash) : false;
}

async function findActiveLegacyAccounts(prisma, bcrypt) {
  const users = await prisma.user.findMany({
    where: {
      username: { in: [...LEGACY_PASSWORDS.keys()] },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, username: true, passwordHash: true },
  });
  const matches = await Promise.all(
    users.map(async (user) => ((await usesLegacyPassword(user, bcrypt)) ? user : null)),
  );
  return matches.filter(Boolean);
}

function readBootstrapCredentials(env) {
  const username = (env.BOOTSTRAP_ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME).trim();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD || "";
  const realName = (env.BOOTSTRAP_ADMIN_REAL_NAME || "系统管理员").trim();

  if (!/^[A-Za-z][A-Za-z0-9._-]{2,31}$/.test(username)) {
    throw new Error(
      "BOOTSTRAP_ADMIN_USERNAME must be 3-32 characters and start with a letter",
    );
  }
  if (password.length < 16 || password.length > 128) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain 16-128 characters");
  }
  if (/\r|\n/.test(password)) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must not contain line breaks");
  }

  const requiredClasses = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
  if (!requiredClasses.every((pattern) => pattern.test(password))) {
    throw new Error(
      "BOOTSTRAP_ADMIN_PASSWORD must include lowercase, uppercase, number, and symbol characters",
    );
  }
  if (password.toLowerCase().includes(username.toLowerCase())) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must not contain the admin username");
  }
  if (!realName || realName.length > 50) {
    throw new Error("BOOTSTRAP_ADMIN_REAL_NAME must contain 1-50 characters");
  }

  return { username, password, realName };
}

async function ensureBootstrapAdmin({ prisma, bcrypt, env = process.env }) {
  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { code: "super_admin" },
    select: { id: true },
  });
  const activeSuperAdmin = await prisma.user.findFirst({
    where: {
      roleId: superAdminRole.id,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, username: true, passwordHash: true },
  });
  const activeLegacyAccounts = await findActiveLegacyAccounts(prisma, bcrypt);
  const activeLegacyIds = new Set(activeLegacyAccounts.map((user) => user.id));

  if (activeSuperAdmin && !activeLegacyIds.has(activeSuperAdmin.id)) {
    if (activeLegacyAccounts.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: activeLegacyAccounts.map((user) => user.id) } },
        data: { isActive: false },
      });
    }
    return {
      created: false,
      rotated: false,
      disabledLegacyAccounts: activeLegacyAccounts.map((user) => user.username),
      id: activeSuperAdmin.id,
      username: activeSuperAdmin.username,
    };
  }

  const credentials = readBootstrapCredentials(env);
  const usernameCollision = await prisma.user.findUnique({
    where: { username: credentials.username },
    select: { id: true },
  });
  if (usernameCollision && usernameCollision.id !== activeSuperAdmin?.id) {
    throw new Error(
      `User ${credentials.username} exists but is not an active super admin; resolve it manually instead of overwriting credentials`,
    );
  }

  const passwordHash = await bcrypt.hash(credentials.password, 12);
  const result = await prisma.$transaction(async (tx) => {
    const admin = activeSuperAdmin
      ? await tx.user.update({
          where: { id: activeSuperAdmin.id },
          data: {
            username: credentials.username,
            passwordHash,
            realName: credentials.realName,
            roleId: superAdminRole.id,
            isActive: true,
            deletedAt: null,
          },
          select: { id: true, username: true },
        })
      : await tx.user.create({
          data: {
            username: credentials.username,
            passwordHash,
            realName: credentials.realName,
            roleId: superAdminRole.id,
            isActive: true,
          },
          select: { id: true, username: true },
        });

    const accountsToDisable = activeLegacyAccounts.filter(
      (user) => user.id !== activeSuperAdmin?.id,
    );
    if (accountsToDisable.length > 0) {
      await tx.user.updateMany({
        where: { id: { in: accountsToDisable.map((user) => user.id) } },
        data: { isActive: false },
      });
    }

    return {
      admin,
      disabledLegacyAccounts: accountsToDisable.map((user) => user.username),
    };
  });

  return {
    created: !activeSuperAdmin,
    rotated: Boolean(activeSuperAdmin),
    disabledLegacyAccounts: result.disabledLegacyAccounts,
    ...result.admin,
  };
}

async function preflightBootstrapAdmin({ prisma, bcrypt, env = process.env }) {
  const activeSuperAdmin = await prisma.user.findFirst({
    where: {
      role: { code: "super_admin" },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, username: true, passwordHash: true },
  });
  if (activeSuperAdmin && !(await usesLegacyPassword(activeSuperAdmin, bcrypt))) {
    return { bootstrapRequired: false };
  }

  readBootstrapCredentials(env);
  return {
    bootstrapRequired: !activeSuperAdmin,
    legacyRotationRequired: Boolean(activeSuperAdmin),
  };
}

module.exports = {
  ensureBootstrapAdmin,
  preflightBootstrapAdmin,
  readBootstrapCredentials,
};
