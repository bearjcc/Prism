import * as ts from "typescript";
import type { PrismManifest } from "./manifest.js";

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

const ALLOWED_CSS_PROPERTIES = new Set([
  "background",
  "clear",
  "color",
  "display",
  "height",
  "margin-left",
  "margin-right",
  "max-width",
  "padding-left",
  "padding-right",
  "position",
  "right",
  "top",
  "width",
]);

const ALLOWED_CSS_AT_RULES = new Set(["media", "-moz-document", "document"]);
const CSS_DECLARATION =
  /(?:[;{}])\s*([-a-zA-Z]+)\s*:\s*[^{};]*(?:;|\})/gu;
const CSS_AT_RULE = /@([a-zA-Z-]+)/gu;
const HOST_FILTER = /^\|\|([a-z0-9.-]+)\^$/iu;
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

export function inspectBrowserFilterText(
  file: string,
  source: string,
): PackageFinding[] {
  const findings: PackageFinding[] = [];
  for (const [index, sourceLine] of source.split(/\r?\n/u).entries()) {
    const line = sourceLine.trim();
    if (line === "" || line.startsWith("!")) {
      continue;
    }
    const match = HOST_FILTER.exec(line);
    if (match !== null && isSafeHost(match[1] ?? "")) {
      continue;
    }
    if (isSafeCosmeticFilter(line)) {
      continue;
    }
    if (match === null || !isSafeHost(match[1] ?? "")) {
      findings.push({
        kind: "filter",
        file,
        line: index + 1,
        message: "browser filter must be a host block in the form ||host^",
      });
    }
  }
  return findings;
}

function isSafeCosmeticFilter(line: string): boolean {
  const separator = line.indexOf("##");
  if (separator < 0 || line.includes("#@#")) {
    return false;
  }
  const domains = line.slice(0, separator).trim();
  const selector = line.slice(separator + 2).trim();
  return (
    (domains === "" ||
      domains
        .split(",")
        .every((domain) => isSafeHost(domain.replace(/^\./u, "")))) &&
    selector !== "" &&
    !/[{}@]/u.test(selector) &&
    !/url\s*\(/iu.test(selector)
  );
}

function isSafeHost(host: string): boolean {
  return (
    host.length > 0 &&
    host.length <= 253 &&
    !host.startsWith(".") &&
    !host.endsWith(".") &&
    !host.includes("..") &&
    host.split(".").every((label) => label.length > 0 && label.length <= 63)
  );
}

export function inspectCssText(
  file: string,
  source: string,
): PackageFinding[] {
  const findings: PackageFinding[] = [];
  const withoutComments = source.replace(/\/\*[\s\S]*?(?:\*\/|$)/gu, "");
  for (const match of withoutComments.matchAll(CSS_AT_RULE)) {
    const atRule = match[1]?.toLowerCase();
    if (atRule !== undefined && !ALLOWED_CSS_AT_RULES.has(atRule)) {
      findings.push({
        kind: "css",
        file,
        line: lineAt(source, match.index ?? 0),
        message: `CSS at-rule @${atRule} is not allowlisted`,
      });
    }
  }
  for (const match of withoutComments.matchAll(CSS_DECLARATION)) {
    const property = match[1]?.toLowerCase();
    if (property !== undefined && !ALLOWED_CSS_PROPERTIES.has(property)) {
      findings.push({
        kind: "css",
        file,
        line: lineAt(source, match.index ?? 0),
        message: `CSS property ${property} is not allowlisted`,
      });
    }
  }
  for (const pattern of [
    /\burl\s*\(/iu,
    /@import\b/iu,
    /@(?:updateURL|downloadURL)\b/iu,
    /\bexpression\s*\(/iu,
    /-moz-binding\b/iu,
    /\bbehavior\s*:/iu,
  ]) {
    const match = pattern.exec(withoutComments);
    if (match !== null) {
      findings.push({
        kind: "css",
        file,
        line: lineAt(source, match.index),
        message: "CSS contains a disallowed construct",
      });
    }
  }
  return findings;
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
