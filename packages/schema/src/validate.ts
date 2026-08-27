import { LineCounter, parseDocument } from "yaml";
import { isCapabilityId } from "./capabilities.js";
import type {
  EgressContract,
  ManifestCapabilities,
  ManifestEgress,
  ManifestFilters,
  PrismManifest,
} from "./manifest.js";

export interface ValidationIssue {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

export class ManifestValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(
      issues
        .map(
          (issue) =>
            `${issue.file}:${issue.line}:${issue.column} ${issue.message}`,
        )
        .join("\n"),
    );
    this.name = "ManifestValidationError";
    this.issues = issues;
  }
}

const ROOT_FIELDS = new Set([
  "id",
  "version",
  "runtime",
  "capabilities",
  "scopes",
  "egress",
  "filters",
  "assets",
  "fixtures",
]);
const CAPABILITY_FIELDS = new Set(["required", "optional"]);
const EGRESS_FIELDS = new Set(["contracts"]);
const CONTRACT_FIELDS = new Set(["id", "url", "methods"]);
const FILTER_FIELDS = new Set(["browser"]);

export function validateManifest(
  source: string,
  file = "prism.yaml",
): PrismManifest {
  const lineCounter = new LineCounter();
  const document = parseDocument(source, {
    lineCounter,
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  });
  const issues: ValidationIssue[] = document.errors.map((error) => {
    const position = lineCounter.linePos(error.pos[0]);
    return {
      file,
      line: position.line,
      column: position.col,
      message: error.message,
    };
  });

  if (issues.length > 0) {
    throw new ManifestValidationError(issues);
  }

  const value: unknown = document.toJS({ maxAliasCount: 0 });
  if (!isRecord(value)) {
    throw new ManifestValidationError([
      issueAt(source, file, "Manifest must be a mapping"),
    ]);
  }

  rejectUnknownFields(value, ROOT_FIELDS, "", source, file, issues);

  const id = requireString(value, "id", source, file, issues);
  const version = requireString(value, "version", source, file, issues);
  const runtime = value.runtime;
  if (runtime !== "native") {
    issues.push(
      issueAt(
        source,
        file,
        "runtime must be native",
        findKeyLine(source, "runtime"),
      ),
    );
  }

  const capabilities = validateCapabilities(
    value.capabilities,
    source,
    file,
    issues,
  );
  const scopes = requireStringArray(value, "scopes", source, file, issues);
  const egress = validateEgress(value.egress, source, file, issues);
  const filters = validateFilters(value.filters, source, file, issues);
  const assets = optionalStringArray(value, "assets", source, file, issues);
  const fixtures = optionalStringArray(value, "fixtures", source, file, issues);

  const declaredCapabilities = [
    ...capabilities.required,
    ...(capabilities.optional ?? []),
  ];
  if (
    declaredCapabilities.includes("network.egress") &&
    (egress === undefined || egress.contracts.length === 0)
  ) {
    issues.push(
      issueAt(
        source,
        file,
        "network.egress requires at least one egress contract",
        findValueLine(source, "network.egress"),
      ),
    );
  }

  if (issues.length > 0) {
    throw new ManifestValidationError(issues);
  }

  return {
    id,
    version,
    runtime: "native",
    capabilities,
    scopes,
    ...(egress === undefined ? {} : { egress }),
    ...(filters === undefined ? {} : { filters }),
    ...(assets === undefined ? {} : { assets }),
    ...(fixtures === undefined ? {} : { fixtures }),
  };
}

function validateCapabilities(
  value: unknown,
  source: string,
  file: string,
  issues: ValidationIssue[],
): ManifestCapabilities {
  if (!isRecord(value)) {
    issues.push(
      issueAt(
        source,
        file,
        "capabilities is required and must be a mapping",
        findKeyLine(source, "capabilities"),
      ),
    );
    return { required: [] };
  }

  rejectUnknownFields(
    value,
    CAPABILITY_FIELDS,
    "capabilities.",
    source,
    file,
    issues,
  );
  const required = capabilityArray(
    value.required,
    "capabilities.required",
    source,
    file,
    issues,
    true,
  );
  const optional =
    value.optional === undefined
      ? undefined
      : capabilityArray(
          value.optional,
          "capabilities.optional",
          source,
          file,
          issues,
          false,
        );

  return {
    required,
    ...(optional === undefined ? {} : { optional }),
  };
}

function capabilityArray(
  value: unknown,
  path: string,
  source: string,
  file: string,
  issues: ValidationIssue[],
  required: boolean,
): ManifestCapabilities["required"] {
  if (!Array.isArray(value)) {
    issues.push(
      issueAt(
        source,
        file,
        `${path}${required ? " is required and" : ""} must be an array`,
        findKeyLine(source, path.split(".").at(-1) ?? path),
      ),
    );
    return [];
  }

  const capabilities: ManifestCapabilities["required"] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !isCapabilityId(entry)) {
      const rendered = typeof entry === "string" ? entry : String(entry);
      issues.push(
        issueAt(
          source,
          file,
          `Unknown capability ${rendered}`,
          findValueLine(source, rendered),
        ),
      );
      continue;
    }
    capabilities.push(entry);
  }
  return capabilities;
}

function validateEgress(
  value: unknown,
  source: string,
  file: string,
  issues: ValidationIssue[],
): ManifestEgress | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    issues.push(
      issueAt(
        source,
        file,
        "egress must be a mapping",
        findKeyLine(source, "egress"),
      ),
    );
    return undefined;
  }

  rejectUnknownFields(value, EGRESS_FIELDS, "egress.", source, file, issues);
  if (!Array.isArray(value.contracts)) {
    issues.push(
      issueAt(
        source,
        file,
        "egress.contracts is required and must be an array",
        findKeyLine(source, "contracts"),
      ),
    );
    return { contracts: [] };
  }
  if (value.contracts.length === 0) {
    issues.push(
      issueAt(
        source,
        file,
        "egress requires at least one egress contract",
        findKeyLine(source, "egress"),
      ),
    );
  }

  const contracts: EgressContract[] = [];
  for (const entry of value.contracts) {
    if (!isRecord(entry)) {
      issues.push(issueAt(source, file, "Egress contract must be a mapping"));
      continue;
    }
    rejectUnknownFields(
      entry,
      CONTRACT_FIELDS,
      "egress.contracts.",
      source,
      file,
      issues,
    );
    const id = requireString(entry, "id", source, file, issues);
    const url = requireString(entry, "url", source, file, issues);
    const methods = optionalStringArray(
      entry,
      "methods",
      source,
      file,
      issues,
    );
    contracts.push({
      id,
      url,
      ...(methods === undefined ? {} : { methods }),
    });
  }
  return { contracts };
}

function validateFilters(
  value: unknown,
  source: string,
  file: string,
  issues: ValidationIssue[],
): ManifestFilters | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    issues.push(
      issueAt(
        source,
        file,
        "filters must be a mapping",
        findKeyLine(source, "filters"),
      ),
    );
    return undefined;
  }

  rejectUnknownFields(value, FILTER_FIELDS, "filters.", source, file, issues);
  const browser = optionalStringArray(
    value,
    "browser",
    source,
    file,
    issues,
  );
  return browser === undefined ? {} : { browser };
}

function rejectUnknownFields(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  prefix: string,
  source: string,
  file: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push(
        issueAt(
          source,
          file,
          `Unknown field ${prefix}${key}`,
          findKeyLine(source, key),
        ),
      );
    }
  }
}

function requireString(
  value: Readonly<Record<string, unknown>>,
  key: string,
  source: string,
  file: string,
  issues: ValidationIssue[],
): string {
  const entry = value[key];
  if (typeof entry !== "string" || entry.length === 0) {
    issues.push(
      issueAt(
        source,
        file,
        `${key} is required and must be a non-empty string`,
        findKeyLine(source, key),
      ),
    );
    return "";
  }
  return entry;
}

function requireStringArray(
  value: Readonly<Record<string, unknown>>,
  key: string,
  source: string,
  file: string,
  issues: ValidationIssue[],
): string[] {
  const result = optionalStringArray(value, key, source, file, issues);
  if (result === undefined) {
    issues.push(
      issueAt(
        source,
        file,
        `${key} is required and must be an array of strings`,
        findKeyLine(source, key),
      ),
    );
    return [];
  }
  return result;
}

function optionalStringArray(
  value: Readonly<Record<string, unknown>>,
  key: string,
  source: string,
  file: string,
  issues: ValidationIssue[],
): string[] | undefined {
  const entry = value[key];
  if (entry === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(entry) ||
    !entry.every((item): item is string => typeof item === "string")
  ) {
    issues.push(
      issueAt(
        source,
        file,
        `${key} must be an array of strings`,
        findKeyLine(source, key),
      ),
    );
    return [];
  }
  return entry;
}

function issueAt(
  source: string,
  file: string,
  message: string,
  line = 1,
): ValidationIssue {
  const sourceLine = source.split(/\r?\n/u)[line - 1] ?? "";
  const column = Math.max(1, sourceLine.search(/\S/u) + 1);
  return { file, line, column, message };
}

function findKeyLine(source: string, key: string): number {
  const expression = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`, "u");
  return findLine(source, expression);
}

function findValueLine(source: string, value: string): number {
  const expression = new RegExp(escapeRegExp(value), "u");
  return findLine(source, expression);
}

function findLine(source: string, expression: RegExp): number {
  const lines = source.split(/\r?\n/u);
  const index = lines.findIndex((line) => expression.test(line));
  return index < 0 ? 1 : index + 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
