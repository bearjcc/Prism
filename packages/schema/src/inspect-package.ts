import * as ts from "typescript";
import type { PrismManifest } from "./manifest.js";
import { inspectCssText } from "./inspect-css.js";
import { inspectBrowserFilterText } from "./inspect-filter.js";

export type PackageFindingKind = "css" | "filter" | "javascript" | "path";

export interface PackageFinding {
  readonly kind: PackageFindingKind;
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

export interface PackageInspection {
  readonly ok: boolean;
  readonly findings: readonly PackageFinding[];
}

export type PackageFiles = Readonly<Record<string, Uint8Array>>;

export { inspectCssText } from "./inspect-css.js";
export { inspectBrowserFilterText } from "./inspect-filter.js";

const FORBIDDEN_PATH = /^(?:filters\/dns(?:\/|$)|gateway(?:\/|$))/u;
const TEXT_DECODER = new TextDecoder();
const FORBIDDEN_JAVASCRIPT_GLOBALS = new Set([
  "chrome",
  "document",
  "eval",
  "fetch",
  "Function",
  "globalThis",
  "indexedDB",
  "self",
  "WebSocket",
  "window",
  "Worker",
  "XMLHttpRequest",
]);
const ALLOWED_JAVASCRIPT_GLOBALS = new Set([
  "Array",
  "Boolean",
  "Error",
  "JSON",
  "Math",
  "Number",
  "Object",
  "Promise",
  "String",
  "undefined",
]);

export function inspectPackage(
  manifest: PrismManifest,
  files: PackageFiles,
): PackageInspection {
  const findings: PackageFinding[] = [];
  for (const path of Object.keys(files).sort()) {
    if (FORBIDDEN_PATH.test(path)) {
      findings.push({
        kind: "path",
        file: path,
        line: 1,
        message: "path is not supported by the v1 extension",
      });
      continue;
    }
    if (path.startsWith("filters/browser/")) {
      findings.push(
        ...inspectBrowserFilterText(
          path,
          TEXT_DECODER.decode(files[path]!),
        ),
      );
      continue;
    }
    if (path.startsWith("styles/") && /\.(?:css|less)$/iu.test(path)) {
      findings.push(
        ...inspectCssText(path, TEXT_DECODER.decode(files[path]!)),
      );
      continue;
    }
    if (
      manifest.runtime === "native" &&
      path.startsWith("src/") &&
      /\.(?:ts|js)$/iu.test(path) &&
      !path.endsWith(".d.ts")
    ) {
      inspectNativeScript(path, TEXT_DECODER.decode(files[path]!), findings);
    }
  }
  return { ok: findings.length === 0, findings };
}

function inspectNativeScript(
  file: string,
  source: string,
  findings: PackageFinding[],
): void {
  const scriptKind = file.endsWith(".ts")
    ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.ES2022,
    true,
    scriptKind,
  );
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.isTypeOnly !== true
    ) {
      addScriptFinding(file, source, statement, "only type imports are allowed", findings);
    }
  }
  const output =
    file.endsWith(".ts")
      ? ts.transpileModule(source, {
          fileName: file,
          compilerOptions: {
            module: ts.ModuleKind.ES2022,
            target: ts.ScriptTarget.ES2022,
            verbatimModuleSyntax: true,
          },
        }).outputText
      : source;
  const outputFile = ts.createSourceFile(
    file,
    output,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.JS,
  );
  const declared = new Set<string>();
  collectDeclaredNames(outputFile, declared);
  const activateExports = outputFile.statements.filter((statement) =>
    hasExportedActivate(statement),
  );
  const exportedStatements = outputFile.statements.filter((statement) =>
    hasExportModifier(statement),
  );
  if (activateExports.length !== 1 || exportedStatements.length !== 1) {
    addScriptFinding(
      file,
      output,
      outputFile,
      "native source must export exactly one activate function",
      findings,
    );
  }
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      const name = node.text;
      if (
        FORBIDDEN_JAVASCRIPT_GLOBALS.has(name) ||
        (name !== "prism" &&
          !ALLOWED_JAVASCRIPT_GLOBALS.has(name) &&
          isUnboundRuntimeName(node, outputFile) &&
          !declared.has(name))
      ) {
        addScriptFinding(
          file,
          output,
          node,
          `${name} is not available to native mod code`,
          findings,
        );
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      addScriptFinding(file, output, node, "dynamic import is not allowed", findings);
    }
    ts.forEachChild(node, visit);
  }
  visit(outputFile);
}

function collectDeclaredNames(
  sourceFile: ts.SourceFile,
  declared: Set<string>,
): void {
  function collectBinding(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      declared.add(node.text);
      return;
    }
    ts.forEachChild(node, collectBinding);
  }
  function visit(node: ts.Node): void {
    if (
      ts.isParameter(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isBindingElement(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isCatchClause(node)
    ) {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node)
      ) {
        if (node.name !== undefined) {
          declared.add(node.name.text);
        }
        if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
          for (const parameter of node.parameters) {
            collectBinding(parameter.name);
          }
        }
      } else if (ts.isCatchClause(node)) {
        if (node.variableDeclaration !== undefined) {
          collectBinding(node.variableDeclaration.name);
        }
      } else if (ts.isParameter(node) || ts.isVariableDeclaration(node)) {
        collectBinding(node.name);
      } else {
        collectBinding(node.name);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function isUnboundRuntimeName(
  node: ts.Identifier,
  sourceFile: ts.SourceFile,
): boolean {
  if (node.parent === undefined) {
    return false;
  }
  if (
    ts.isPropertyAccessExpression(node.parent) &&
    node.parent.name === node
  ) {
    return false;
  }
  if (
    ts.isPropertyAssignment(node.parent) &&
    node.parent.name === node
  ) {
    return false;
  }
  if (
    ts.isMethodDeclaration(node.parent) &&
    node.parent.name === node
  ) {
    return false;
  }
  if (
    ts.isPropertyDeclaration(node.parent) &&
    node.parent.name === node
  ) {
    return false;
  }
  if (
    ts.isBindingElement(node.parent) &&
    node.parent.name === node
  ) {
    return false;
  }
  if (
    ts.isFunctionDeclaration(node.parent) &&
    node.parent.name === node
  ) {
    return false;
  }
  if (ts.isClassDeclaration(node.parent) && node.parent.name === node) {
    return false;
  }
  return (
    node.getSourceFile() === sourceFile &&
    node.parent.kind !== ts.SyntaxKind.TypeReference
  );
}

function hasExportedActivate(statement: ts.Statement): boolean {
  return (
    ts.isFunctionDeclaration(statement) &&
    statement.name?.text === "activate" &&
    hasExportModifier(statement)
  );
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) ?? false
  );
}

function addScriptFinding(
  file: string,
  source: string,
  node: ts.Node,
  message: string,
  findings: PackageFinding[],
): void {
  findings.push({
    kind: "javascript",
    file,
    line: lineAt(source, node.getStart()),
    message,
  });
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split(/\r?\n/u).length;
}
