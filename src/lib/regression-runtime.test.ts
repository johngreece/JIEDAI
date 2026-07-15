import { describe, expect, it, vi } from "vitest";

const {
  REGRESSION_MUTATION_CONFIRMATION,
  createRegressionUsers,
  createRuntimePassword,
  deactivateRegressionUsers,
  parseDatabaseIdentity,
  requireIsolatedRegressionDatabase,
} = require("../../scripts/lib/regression-runtime.js");

describe("regression fixture isolation", () => {
  it("recognizes direct and pooler URLs for the same Supabase project", () => {
    expect(
      parseDatabaseIdentity(
        "postgresql://postgres:secret@db.project-ref.supabase.co:5432/postgres",
        "DIRECT_URL",
      ),
    ).toBe("supabase:project-ref:postgres");
    expect(
      parseDatabaseIdentity(
        "postgresql://postgres.project-ref:secret@aws-0-eu.pooler.supabase.com:6543/postgres",
        "DATABASE_URL",
      ),
    ).toBe("supabase:project-ref:postgres");
  });

  it("fails closed without an explicit mutation confirmation", () => {
    expect(() =>
      requireIsolatedRegressionDatabase({
        REGRESSION_DATABASE_URL: "postgresql://localhost:5432/regression",
      }),
    ).toThrow("Refusing to write regression fixtures");
  });

  it("rejects a regression URL that resolves to the production Supabase project", () => {
    expect(() =>
      requireIsolatedRegressionDatabase({
        ALLOW_REGRESSION_FIXTURES: REGRESSION_MUTATION_CONFIRMATION,
        REGRESSION_DATABASE_URL:
          "postgresql://postgres.project-ref:test@aws-0-eu.pooler.supabase.com:6543/postgres",
        DIRECT_URL: "postgresql://postgres:prod@db.project-ref.supabase.co:5432/postgres",
      }),
    ).toThrow("must not point to the same database as DIRECT_URL");
  });

  it("accepts a separately named local test database", () => {
    expect(
      requireIsolatedRegressionDatabase({
        ALLOW_REGRESSION_FIXTURES: REGRESSION_MUTATION_CONFIRMATION,
        REGRESSION_DATABASE_URL: "postgresql://localhost:5432/loan_regression",
        DATABASE_URL: "postgresql://localhost:5432/loan_production",
      }),
    ).toBe("postgresql://localhost:5432/loan_regression");
  });

  it("generates strong non-deterministic runtime passwords", () => {
    const first = createRuntimePassword();
    const second = createRuntimePassword();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(24);
    expect(first).toMatch(/[a-z]/);
    expect(first).toMatch(/[A-Z]/);
    expect(first).toMatch(/\d/);
    expect(first).toMatch(/[^A-Za-z0-9]/);
  });

  it("creates random role fixtures atomically and deactivates them after a run", async () => {
    const userCreate = vi.fn(async ({ data }: { data: { username: string } }) => ({
      id: `id-${data.username}`,
      username: data.username,
    }));
    const prisma = {
      role: {
        findMany: vi.fn(async () => [
          { id: "role-admin", code: "super_admin" },
          { id: "role-finance", code: "finance" },
        ]),
      },
      user: {
        updateMany: vi.fn(async () => ({ count: 2 })),
      },
      $transaction: vi.fn(async (operation: (tx: unknown) => unknown) =>
        operation({ user: { create: userCreate } }),
      ),
    };
    const bcrypt = { hash: vi.fn(async (password: string) => `hash:${password.length}`) };

    const users = await createRegressionUsers({
      prisma,
      bcrypt,
      tag: "REG-12345678",
      roleCodes: ["super_admin", "finance"],
    });

    expect(users.super_admin.password).not.toBe(users.finance.password);
    expect(userCreate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(userCreate.mock.calls)).not.toContain(users.super_admin.password);

    await expect(
      deactivateRegressionUsers(prisma, [users.super_admin.id, users.finance.id]),
    ).resolves.toBe(2);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [users.super_admin.id, users.finance.id] } },
      data: { isActive: false, deletedAt: expect.any(Date) },
    });
  });
});
