import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const TRANSITION_SERVICE_PATH = path.join(
  "src",
  "services",
  "loan-transition.service.ts",
);

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = path.join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return walkFiles(fullPath);
    return /\.(ts|tsx)$/.test(name) ? [fullPath] : [];
  });
}

function propertyName(node: ts.PropertyName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return null;
}

function objectProperty(object: ts.ObjectLiteralExpression, name: string): ts.Expression | null {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (propertyName(property.name) === name) return property.initializer;
  }
  return null;
}

function isLoanApplicationMutation(node: ts.CallExpression): boolean {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (callee.name.text !== "update" && callee.name.text !== "updateMany") return false;

  const target = callee.expression;
  return ts.isPropertyAccessExpression(target) && target.name.text === "loanApplication";
}

function findDirectStatusWrites(filePath: string): string[] {
  const sourceText = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const findings: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && isLoanApplicationMutation(node)) {
      const argument = node.arguments[0];
      if (argument && ts.isObjectLiteralExpression(argument)) {
        const data = objectProperty(argument, "data");
        if (data && ts.isObjectLiteralExpression(data)) {
          const writesStatus = data.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) && propertyName(property.name) === "status",
          );
          if (writesStatus) {
            const position = source.getLineAndCharacterOfPosition(node.getStart(source));
            findings.push(`${filePath}:${position.line + 1}`);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return findings;
}

describe("loan lifecycle mutation guard", () => {
  it("keeps loan status writes inside the transition service", () => {
    const root = process.cwd();
    const files = walkFiles(path.join(root, "src")).filter((file) => {
      const relative = path.relative(root, file).replace(/\\/g, "/");
      return relative !== TRANSITION_SERVICE_PATH.replace(/\\/g, "/");
    });

    expect(files.flatMap(findDirectStatusWrites)).toEqual([]);
  });
});
