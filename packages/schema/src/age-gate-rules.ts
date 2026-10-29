import { isSafeModSelector } from "./mod-selector.js";

const TEXT_DECODER = new TextDecoder();

export { isSafeModSelector } from "./mod-selector.js";

const MAX_SITES = 500;
const MAX_STORAGE_KEYS = 32;
const MAX_COOKIE_ENTRIES = 8;
const MAX_STRING_VALUE_LENGTH = 512;
const MAX_ORIGIN_LENGTH = 256;

export interface AgeGateCookieRule {
  readonly name: string;
  readonly value: string;
  readonly maxAgeDays?: number;
}

export interface AgeGateSiteRule {
  readonly match: string;
  readonly localStorage?: Readonly<Record<string, string>>;
  readonly cookies?: readonly AgeGateCookieRule[];
  readonly confirm?: string;
  readonly overlay?: string;
}

export interface AgeGateRulesFile {
  readonly sites: readonly AgeGateSiteRule[];
}

export type AgeGateRulesIssue = Readonly<{
  readonly message: string;
}>;

export function parseAgeGateRulesJson(
  source: string,
): AgeGateRulesFile | AgeGateRulesIssue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return [{ message: "rules JSON is invalid" }];
  }
  return validateAgeGateRulesValue(parsed);
}

export function readAgeGateRulesFromFiles(
  files: Readonly<Record<string, Uint8Array>> | undefined,
): AgeGateRulesFile {
  if (files === undefined) {
    return { sites: [] };
  }
  const raw = files["rules/sites.json"];
  if (raw === undefined) {
    return { sites: [] };
  }
  const result = parseAgeGateRulesJson(TEXT_DECODER.decode(raw));
  if (Array.isArray(result)) {
    return { sites: [] };
  }
  return result;
}

export function inspectAgeGateRulesFile(
  path: string,
  source: string,
): readonly AgeGateRulesIssue[] {
  if (path !== "rules/sites.json") {
    return [];
  }
  const result = parseAgeGateRulesJson(source);
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}

export function findAgeGateSiteRule(
  rules: readonly AgeGateSiteRule[],
  pageUrl: string,
): AgeGateSiteRule | undefined {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return undefined;
  }
  for (const rule of rules) {
    if (originMatches(rule.match, origin)) {
      return rule;
    }
  }
  return undefined;
}

function originMatches(match: string, origin: string): boolean {
  if (match === origin) {
    return true;
  }
  try {
    const parsed = new URL(match);
    return parsed.origin === origin;
  } catch {
    return false;
  }
}

function validateAgeGateRulesValue(
  value: unknown,
): AgeGateRulesFile | AgeGateRulesIssue[] {
  const issues: AgeGateRulesIssue[] = [];
  if (!isRecord(value)) {
    return [{ message: "rules root must be an object" }];
  }
  if (!Array.isArray(value.sites)) {
    return [{ message: "rules.sites must be an array" }];
  }
  if (value.sites.length > MAX_SITES) {
    issues.push({ message: `rules.sites exceeds ${MAX_SITES} entries` });
  }
  const sites: AgeGateSiteRule[] = [];
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
  issues: AgeGateRulesIssue[],
): AgeGateSiteRule | undefined {
  if (!isRecord(value)) {
    issues.push({ message: `sites[${index}] must be an object` });
    return undefined;
  }
  const match = value.match;
  if (typeof match !== "string" || match.trim() === "") {
    issues.push({ message: `sites[${index}].match must be a non-empty string` });
    return undefined;
  }
  if (match.length > MAX_ORIGIN_LENGTH) {
    issues.push({ message: `sites[${index}].match is too long` });
    return undefined;
  }
  let normalisedMatch = match.trim();
  try {
    normalisedMatch = new URL(match).origin;
  } catch {
    try {
      normalisedMatch = new URL(`https://${match}`).origin;
    } catch {
      issues.push({
        message: `sites[${index}].match must be an https origin or URL`,
      });
      return undefined;
    }
  }
  const localStorage = readStringMap(
    value.localStorage,
    `sites[${index}].localStorage`,
    issues,
    MAX_STORAGE_KEYS,
  );
  const cookies = readCookies(value.cookies, index, issues);
  const confirm = readOptionalSelector(value.confirm, `sites[${index}].confirm`, issues);
  const overlay = readOptionalSelector(value.overlay, `sites[${index}].overlay`, issues);
  if (
    localStorage === undefined &&
    cookies.length === 0 &&
    confirm === undefined &&
    overlay === undefined
  ) {
    issues.push({
      message: `sites[${index}] needs localStorage, cookies, confirm, or overlay`,
    });
    return undefined;
  }
  return {
    match: normalisedMatch,
    ...(localStorage === undefined ? {} : { localStorage }),
    ...(cookies.length === 0 ? {} : { cookies }),
    ...(confirm === undefined ? {} : { confirm }),
    ...(overlay === undefined ? {} : { overlay }),
  };
}

function readCookies(
  value: unknown,
  index: number,
  issues: AgeGateRulesIssue[],
): AgeGateCookieRule[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push({ message: `sites[${index}].cookies must be an array` });
    return [];
  }
  if (value.length > MAX_COOKIE_ENTRIES) {
    issues.push({
      message: `sites[${index}].cookies exceeds ${MAX_COOKIE_ENTRIES} entries`,
    });
  }
  const cookies: AgeGateCookieRule[] = [];
  for (const [cookieIndex, entry] of value.entries()) {
    if (!isRecord(entry)) {
      issues.push({
        message: `sites[${index}].cookies[${cookieIndex}] must be an object`,
      });
      continue;
    }
    const name = entry.name;
    const cookieValue = entry.value;
    if (typeof name !== "string" || !isSafeCookieName(name)) {
      issues.push({
        message: `sites[${index}].cookies[${cookieIndex}].name is invalid`,
      });
      continue;
    }
    if (typeof cookieValue !== "string" || cookieValue.length > MAX_STRING_VALUE_LENGTH) {
      issues.push({
        message: `sites[${index}].cookies[${cookieIndex}].value is invalid`,
      });
      continue;
    }
    let maxAgeDays: number | undefined;
    if (entry.maxAgeDays !== undefined) {
      if (typeof entry.maxAgeDays !== "number" || !Number.isFinite(entry.maxAgeDays)) {
        issues.push({
          message: `sites[${index}].cookies[${cookieIndex}].maxAgeDays must be a number`,
        });
        continue;
      }
      maxAgeDays = Math.min(3650, Math.max(1, Math.floor(entry.maxAgeDays)));
    }
    cookies.push({
      name,
      value: cookieValue,
      ...(maxAgeDays === undefined ? {} : { maxAgeDays }),
    });
  }
  return cookies;
}

function readStringMap(
  value: unknown,
  label: string,
  issues: AgeGateRulesIssue[],
  maxKeys: number,
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    issues.push({ message: `${label} must be an object` });
    return undefined;
  }
  const keys = Object.keys(value);
  if (keys.length > maxKeys) {
    issues.push({ message: `${label} exceeds ${maxKeys} keys` });
  }
  const map: Record<string, string> = {};
  for (const key of keys) {
    if (!isSafeStorageKey(key)) {
      issues.push({ message: `${label} key ${key} is invalid` });
      continue;
    }
    const entry = value[key];
    if (typeof entry !== "string" || entry.length > MAX_STRING_VALUE_LENGTH) {
      issues.push({ message: `${label}.${key} must be a string` });
      continue;
    }
    map[key] = entry;
  }
  return Object.keys(map).length === 0 ? undefined : map;
}

function readOptionalSelector(
  value: unknown,
  label: string,
  issues: AgeGateRulesIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !isSafeModSelector(value)) {
    issues.push({ message: `${label} must be a safe CSS selector string` });
    return undefined;
  }
  return value;
}

function isSafeCookieName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 128 &&
    /^[\w!#$%&'*+.^`|~/-]+$/u.test(name)
  );
}

function isSafeStorageKey(key: string): boolean {
  return key.length > 0 && key.length <= 128 && !/[\s\r\n"';\\]/u.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
