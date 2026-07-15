import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const APPEND_ONLY_MODELS = new Set([
  "ledgerEntry",
  "fundAccountJournal",
  "repaymentConfirmationEvent",
]);
const FINANCIAL_RECORD_MODELS = new Set([
  "capitalInflow",
  "disbursement",
  "repayment",
  "funderWithdrawal",
  "funderInterestSettlement",
]);
const CREATE_OWNERS: Record<string, string> = {
  ledgerEntry: "src/services/ledger.service.ts",
  fundAccountJournal: "src/services/fund-account-ledger.service.ts",
  repaymentConfirmationEvent:
    "src/services/repayment-confirmation-evidence.service.ts",
};
const EXPECTED_STATUS_CLAIM_ROUTES: Record<string, string> = {
  "src/app/api/repayments/[id]/route.ts": "repayment",
  "src/app/api/client/disbursements/[id]/confirm-received/route.ts": "disbursement",
};

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = path.join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return walkFiles(fullPath);
    return /\.(ts|tsx|js|jsx)$/.test(name) ? [fullPath] : [];
  });
}

function mutationTarget(node: ts.CallExpression) {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const target = callee.expression;
  if (!ts.isPropertyAccessExpression(target)) return null;
  return { model: target.name.text, method: callee.name.text };
}

function findViolations(root: string, filePath: string): string[] {
  const sourceText = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const relative = path.relative(root, filePath).replace(/\\/g, "/");
  const findings: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const target = mutationTarget(node);
      if (target) {
        const destructive = ["update", "updateMany", "delete", "deleteMany"].includes(
          target.method,
        );
        const hardDelete = ["delete", "deleteMany"].includes(target.method);
        const wrongCreateOwner =
          target.method === "create" &&
          APPEND_ONLY_MODELS.has(target.model) &&
          relative !== CREATE_OWNERS[target.model];
        const nonAtomicStatusUpdate =
          target.method === "update" &&
          EXPECTED_STATUS_CLAIM_ROUTES[relative] === target.model;

        if (
          (destructive && APPEND_ONLY_MODELS.has(target.model)) ||
          (hardDelete && FINANCIAL_RECORD_MODELS.has(target.model)) ||
          wrongCreateOwner ||
          nonAtomicStatusUpdate
        ) {
          const position = source.getLineAndCharacterOfPosition(node.getStart(source));
          findings.push(`${relative}:${position.line + 1} ${target.model}.${target.method}`);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return findings;
}

describe("financial record immutability guard", () => {
  it("keeps financial records append-only and guarded by expected-state claims", () => {
    const root = process.cwd();
    const files = ["src", "scripts", "prisma"].flatMap((directory) =>
      walkFiles(path.join(root, directory)),
    );
    expect(files.flatMap((file) => findViolations(root, file))).toEqual([]);
  });
});
