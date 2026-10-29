import { isSafeModSelector } from "./mod-selector.js";

const TEXT_DECODER = new TextDecoder();

const MAX_SITES = 500;
const MAX_ORIGIN_LENGTH = 256;

export type SubscribeMarkupPlatform = "medium" | "substack";

export interface SubscribeDismissSiteRule {
  readonly match?: string;
  readonly markup?: SubscribeMarkupPlatform;
  readonly modal: string;
  readonly backdrop?: string;
  readonly dismiss?: string;
}

export interface SubscribeDismissRulesFile {
  readonly sites: readonly SubscribeDismissSiteRule[];
}

export type SubscribeDismissRulesIssue = Readonly<{
  readonly message: string;
}>;

export function parseSubscribeDismissRulesJson(
  source: string,
): SubscribeDismissRulesFile | SubscribeDismissRulesIssue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return [{ message: "rules JSON is invalid" }];
  }
  return validateSubscribeDismissRulesValue(parsed);
}

export function readSubscribeDismissRulesFromFiles(
  files: Readonly<Record<string, Uint8Array>> | undefined,
): SubscribeDismissRulesFile {
  if (files === undefined) {
    return { sites: [] };
  }
  const raw = files["rules/sites.json"];
  if (raw === undefined) {
    return { sites: [] };
  }
  const result = parseSubscribeDismissRulesJson(TEXT_DECODER.decode(raw));
  if (Array.isArray(result)) {
    return { sites: [] };
  }
  return result;
}

export function inspectSubscribeDismissRulesFile(
  path: string,
  source: string,
): readonly SubscribeDismissRulesIssue[] {
  if (path !== "rules/sites.json") {
    return [];
  }
  const result = parseSubscribeDismissRulesJson(source);
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}

export function findSubscribeDismissSiteRules(
  rules: readonly SubscribeDismissSiteRule[],
  pageUrl: string,
  markup: SubscribeMarkupPlatform | undefined,
): readonly SubscribeDismissSiteRule[] {
  let origin: string | undefined;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    origin = undefined;
  }
  const matched: SubscribeDismissSiteRule[] = [];
  for (const rule of rules) {
    if (rule.match !== undefined && origin !== undefined && originMatches(rule.match, origin)) {
      matched.push(rule);
      continue;
    }
    if (rule.markup !== undefined && rule.markup === markup) {
      matched.push(rule);
    }
  }
  return matched;
}

function originMatches(match: string, origin: string): boolean {
  if (match === origin) {
    return true;
  }
  try {
    return new URL(match).origin === origin;
  } catch {
    return false;
  }
}

function validateSubscribeDismissRulesValue(
  value: unknown,
): SubscribeDismissRulesFile | SubscribeDismissRulesIssue[] {
  const issues: SubscribeDismissRulesIssue[] = [];
  if (!isRecord(value)) {
    return [{ message: "rules root must be an object" }];
  }
  if (!Array.isArray(value.sites)) {
    return [{ message: "rules.sites must be an array" }];
  }
  if (value.sites.length > MAX_SITES) {
    issues.push({ message: `rules.sites exceeds ${MAX_SITES} entries` });
  }
  const sites: SubscribeDismissSiteRule[] = [];
  for (const [index, entry] of value.sites.entries()) {
    const site = validateSiteRule(entry, index, issues);
    if (site !== undefined) {
      sites.push(site);
    }
  }
  if (issues.length > 0) {
    return issues;
  }
  return { sites };
}

function validateSiteRule(
  value: unknown,
  index: number,
  issues: SubscribeDismissRulesIssue[],
): SubscribeDismissSiteRule | undefined {
  if (!isRecord(value)) {
    issues.push({ message: `sites[${index}] must be an object` });
    return undefined;
  }
  const match =
    value.match === undefined ? undefined : readOrigin(value.match, index, issues);
  const markup = readMarkup(value.markup, index, issues);
  if (match === undefined && markup === undefined) {
    issues.push({
      message: `sites[${index}] needs match or markup`,
    });
    return undefined;
  }
  const modal = readRequiredSelector(value.modal, `sites[${index}].modal`, issues);
  if (modal === undefined) {
    return undefined;
  }
  const backdrop = readOptionalSelector(
    value.backdrop,
    `sites[${index}].backdrop`,
    issues,
  );
  const dismiss = readOptionalSelector(
    value.dismiss,
    `sites[${index}].dismiss`,
    issues,
  );
  return {
    ...(match === undefined ? {} : { match }),
    ...(markup === undefined ? {} : { markup }),
    modal,
    ...(backdrop === undefined ? {} : { backdrop }),
    ...(dismiss === undefined ? {} : { dismiss }),
  };
}

function readOrigin(
  value: unknown,
  index: number,
  issues: SubscribeDismissRulesIssue[],
): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ message: `sites[${index}].match must be a non-empty string` });
    return undefined;
  }
  if (value.length > MAX_ORIGIN_LENGTH) {
    issues.push({ message: `sites[${index}].match is too long` });
    return undefined;
  }
  try {
    return new URL(value).origin;
  } catch {
    try {
      return new URL(`https://${value}`).origin;
    } catch {
      issues.push({
        message: `sites[${index}].match must be an https origin or URL`,
      });
      return undefined;
    }
  }
}

function readMarkup(
  value: unknown,
  index: number,
  issues: SubscribeDismissRulesIssue[],
): SubscribeMarkupPlatform | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "medium" || value === "substack") {
    return value;
  }
  issues.push({ message: `sites[${index}].markup must be medium or substack` });
  return undefined;
}

function readRequiredSelector(
  value: unknown,
  label: string,
  issues: SubscribeDismissRulesIssue[],
): string | undefined {
  if (typeof value !== "string" || !isSafeModSelector(value)) {
    issues.push({ message: `${label} must be a safe CSS selector string` });
    return undefined;
  }
  return value;
}

function readOptionalSelector(
  value: unknown,
  label: string,
  issues: SubscribeDismissRulesIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readRequiredSelector(value, label, issues);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
