import { describe, expect, it, vi } from "vitest";

const {
  ensureBootstrapAdmin,
  preflightBootstrapAdmin,
  readBootstrapCredentials,
} = require("../../prisma/seed-bootstrap.js");

type MockUser = {
  id: string;
  username: string;
  passwordHash: string;
};

function createPrismaMock(params?: {
  activeAdmin?: MockUser | null;
  usernameCollision?: { id: string } | null;
  legacyAccounts?: MockUser[];
}) {
  const user = {
    findFirst: vi.fn(async () => params?.activeAdmin ?? null),
    findMany: vi.fn(async () => params?.legacyAccounts ?? []),
    findUnique: vi.fn(async () => params?.usernameCollision ?? null),
    create: vi.fn(async ({ data }: { data: { username: string } }) => ({
      id: "user-created",
      username: data.username,
    })),
    update: vi.fn(async ({ data }: { data: { username: string } }) => ({
      id: params?.activeAdmin?.id ?? "user-updated",
      username: data.username,
    })),
    updateMany: vi.fn(async () => ({ count: params?.legacyAccounts?.length ?? 0 })),
  };
  const transactionClient = { user };

  return {
    role: {
      findUniqueOrThrow: vi.fn(async () => ({ id: "role-super-admin" })),
    },
    user,
    $transaction: vi.fn(async (operation: (tx: typeof transactionClient) => unknown) =>
      operation(transactionClient),
    ),
  };
}

const strongCredentials = {
  BOOTSTRAP_ADMIN_USERNAME: "internal.admin",
  BOOTSTRAP_ADMIN_PASSWORD: "T9!qL2@wR7#xP4$z",
  BOOTSTRAP_ADMIN_REAL_NAME: "内部管理员",
};

describe("production bootstrap admin", () => {
  it("requires a strong one-time password for the first super admin", () => {
    expect(() => readBootstrapCredentials({})).toThrow(
      "BOOTSTRAP_ADMIN_PASSWORD must contain 16-128 characters",
    );
    expect(() =>
      readBootstrapCredentials({
        BOOTSTRAP_ADMIN_PASSWORD: "onlylowercasepassword",
      }),
    ).toThrow("must include lowercase, uppercase, number, and symbol");
    expect(readBootstrapCredentials(strongCredentials)).toEqual({
      username: "internal.admin",
      password: strongCredentials.BOOTSTRAP_ADMIN_PASSWORD,
      realName: "内部管理员",
    });
  });

  it("fails before seed writes when the first admin password is missing", async () => {
    const prisma = createPrismaMock();
    const bcrypt = { compare: vi.fn(async () => false) };

    await expect(preflightBootstrapAdmin({ prisma, bcrypt, env: {} })).rejects.toThrow(
      "BOOTSTRAP_ADMIN_PASSWORD must contain 16-128 characters",
    );
    expect(prisma.role.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("preserves an existing secure super admin without changing a password", async () => {
    const prisma = createPrismaMock({
      activeAdmin: { id: "existing-admin", username: "owner", passwordHash: "secure" },
    });
    const bcrypt = {
      hash: vi.fn(),
      compare: vi.fn(async () => false),
    };

    await expect(ensureBootstrapAdmin({ prisma, bcrypt, env: {} })).resolves.toEqual({
      created: false,
      rotated: false,
      disabledLegacyAccounts: [],
      id: "existing-admin",
      username: "owner",
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it("creates one super admin without persisting the raw password", async () => {
    const prisma = createPrismaMock();
    const bcrypt = {
      hash: vi.fn(async () => "secure-password-hash"),
      compare: vi.fn(async () => false),
    };

    await expect(
      ensureBootstrapAdmin({ prisma, bcrypt, env: strongCredentials }),
    ).resolves.toEqual({
      created: true,
      rotated: false,
      disabledLegacyAccounts: [],
      id: "user-created",
      username: "internal.admin",
    });
    expect(bcrypt.hash).toHaveBeenCalledWith(strongCredentials.BOOTSTRAP_ADMIN_PASSWORD, 12);
    expect(JSON.stringify(prisma.user.create.mock.calls)).not.toContain(
      strongCredentials.BOOTSTRAP_ADMIN_PASSWORD,
    );
  });

  it("refuses to overwrite a colliding inactive or non-admin account", async () => {
    const prisma = createPrismaMock({ usernameCollision: { id: "collision" } });
    const bcrypt = {
      hash: vi.fn(),
      compare: vi.fn(async () => false),
    };

    await expect(
      ensureBootstrapAdmin({ prisma, bcrypt, env: strongCredentials }),
    ).rejects.toThrow("resolve it manually instead of overwriting credentials");
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it("rotates a legacy super admin and disables other default accounts atomically", async () => {
    const legacyAccounts = [
      { id: "legacy-admin", username: "admin", passwordHash: "legacy-admin-hash" },
      { id: "legacy-finance", username: "finance", passwordHash: "legacy-finance-hash" },
    ];
    const prisma = createPrismaMock({
      activeAdmin: legacyAccounts[0],
      legacyAccounts,
    });
    const bcrypt = {
      hash: vi.fn(async () => "rotated-password-hash"),
      compare: vi.fn(async () => true),
    };

    await expect(
      ensureBootstrapAdmin({ prisma, bcrypt, env: strongCredentials }),
    ).resolves.toEqual({
      created: false,
      rotated: true,
      disabledLegacyAccounts: ["finance"],
      id: "legacy-admin",
      username: "internal.admin",
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "legacy-admin" },
        data: expect.objectContaining({
          username: "internal.admin",
          passwordHash: "rotated-password-hash",
        }),
      }),
    );
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["legacy-finance"] } },
      data: { isActive: false },
    });
  });
});
