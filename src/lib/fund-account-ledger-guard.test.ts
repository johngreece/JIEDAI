import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const MONEY_FIELDS = new Set(["balance", "totalInflow", "totalOutflow", "totalProfit"]);
const LEDGER_SERVICE_PATH = path.join("src", "services", "fund-account-ledger.service.ts");

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = path.join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return walkFiles(fullPath);
    if (/\.(ts|tsx)$/.test(name)) return [fullPath];
    return [];
  });
}

function propertyName(node: ts.PropertyName) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return null;
}

function objectProperty(source: ts.SourceFile, object: ts.ObjectLiteralExpression, name: string) {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (propertyName(property.name) === name) return property.initializer;
  }

  return null;
}

function isFundAccountMutationCall(node: ts.CallExpression) {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (callee.name.text !== "update" && callee.name.text !== "updateMany") return false;

  const target = callee.expression;
  return ts.isPropertyAccessExpression(target) && target.name.text === "fundAccount";
}

function findManualMoneyUpdates(filePath: string) {
  const sourceText = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const findings: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && isFundAccountMutationCall(node)) {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const data = objectProperty(source, arg, "data");
        if (data && ts.isObjectLiteralExpression(data)) {
          const fields = data.properties
            .filter(ts.isPropertyAssignment)
            .map((property) => propertyName(property.name))
            .filter((name): name is string => name !== null && MONEY_FIELDS.has(name));

          if (fields.length > 0) {
            const position = source.getLineAndCharacterOfPosition(node.getStart(source));
            findings.push(`${filePath}:${position.line + 1} updates ${fields.join(", ")}`);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return findings;
}

describe("fund account ledger guard", () => {
  it("keeps fund account money-field mutations inside the ledger service", () => {
    const root = process.cwd();
    const files = walkFiles(path.join(root, "src")).filter((file) => {
      const relative = path.relative(root, file).replace(/\\/g, "/");
      return relative !== LEDGER_SERVICE_PATH.replace(/\\/g, "/");
    });

    const offenders = files.flatMap(findManualMoneyUpdates);
    expect(offenders).toEqual([]);
  });
});
