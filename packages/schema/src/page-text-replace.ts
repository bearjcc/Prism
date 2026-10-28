export const PAGE_TEXT_REPLACE_CAPABILITY = "page.text.replace" as const;

export type PageTextReplaceCaseMode = "literal" | "matchSource";

export type PageTextReplaceStyleId =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "allCaps"
  | "smallCaps"
  | "highlight";

export interface PageTextReplacePair {
  readonly id: string;
  readonly find: string;
  readonly replace: string;
  readonly enabled: boolean;
  readonly wholeWord: boolean;
  readonly caseSensitive: boolean;
  readonly caseMode: PageTextReplaceCaseMode;
  readonly styles: Partial<Record<PageTextReplaceStyleId, boolean>>;
}

export interface PageTextReplaceRules {
  readonly pairs: readonly PageTextReplacePair[];
}

export interface PageTextReplaceSegment {
  readonly text: string;
  readonly styles?: Partial<Record<PageTextReplaceStyleId, boolean>>;
}

export interface PageTextReplaceResult {
  readonly segments: readonly PageTextReplaceSegment[];
  readonly replacementCount: number;
}

export interface CompiledPageTextReplaceRule {
  readonly pair: PageTextReplacePair;
  readonly find: string;
  readonly findLower: string;
}

export function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function isWordChar(codePoint: string): boolean {
  return /[\p{L}\p{N}_]/u.test(codePoint);
}

export function isWordBoundary(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1]! : "";
  const after = end < text.length ? text[end]! : "";
  return !isWordChar(before) && !isWordChar(after);
}

export function compilePageTextReplaceRules(
  rules: PageTextReplaceRules,
): CompiledPageTextReplaceRule[] {
  return rules.pairs
    .filter((pair) => pair.enabled && pair.find.length > 0)
    .slice()
    .sort((left, right) => right.find.length - left.find.length)
    .map((pair) => ({
      pair,
      find: pair.find,
      findLower: pair.find.toLocaleLowerCase(),
    }));
}

function stringsEqualAt(
  haystack: string,
  index: number,
  needle: string,
  caseSensitive: boolean,
): boolean {
  if (index + needle.length > haystack.length) {
    return false;
  }
  const slice = haystack.slice(index, index + needle.length);
  if (caseSensitive) {
    return slice === needle;
  }
  return slice.toLocaleLowerCase() === needle.toLocaleLowerCase();
}

function applyCaseMode(
  matched: string,
  replacement: string,
  caseMode: PageTextReplaceCaseMode,
): string {
  if (caseMode === "literal") {
    return replacement;
  }
  if (matched === matched.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (matched === matched.toLowerCase()) {
    return replacement.toLowerCase();
  }
  if (
    matched.length > 0 &&
    matched[0] === matched[0]!.toUpperCase() &&
    matched.slice(1) === matched.slice(1).toLowerCase()
  ) {
    return toTitleCase(replacement);
  }
  return replacement;
}

function toTitleCase(value: string): string {
  return value.replace(
    /\p{L}[\p{L}\p{N}]*/gu,
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
  );
}

export function matchPageTextReplaceRuleAt(
  text: string,
  index: number,
  rule: CompiledPageTextReplaceRule,
): number {
  const { pair } = rule;
  if (!stringsEqualAt(text, index, pair.find, pair.caseSensitive)) {
    return 0;
  }
  const end = index + pair.find.length;
  if (pair.wholeWord && !isWordBoundary(text, index, end)) {
    return 0;
  }
  return pair.find.length;
}

export function replacePageTextInString(
  text: string,
  rules: PageTextReplaceRules,
): PageTextReplaceResult {
  const compiled = compilePageTextReplaceRules(rules);
  const segments: PageTextReplaceSegment[] = [];
  let replacementCount = 0;
  let index = 0;
  let buffer = "";

  const flushBuffer = (): void => {
    if (buffer.length === 0) {
      return;
    }
    segments.push({ text: buffer });
    buffer = "";
  };

  while (index < text.length) {
    let matchedLength = 0;
    let matchedRule: CompiledPageTextReplaceRule | undefined;
    for (const rule of compiled) {
      const length = matchPageTextReplaceRuleAt(text, index, rule);
      if (length > 0) {
        matchedLength = length;
        matchedRule = rule;
        break;
      }
    }
    if (matchedRule === undefined || matchedLength === 0) {
      buffer += text[index]!;
      index += 1;
      continue;
    }
    flushBuffer();
    const matchedText = text.slice(index, index + matchedLength);
    const replacementText = matchedRule.pair.caseSensitive
      ? matchedRule.pair.replace
      : applyCaseMode(
          matchedText,
          matchedRule.pair.replace,
          matchedRule.pair.caseMode,
        );
    const styles = readEnabledStyles(matchedRule.pair.styles);
    segments.push({
      text: replacementText,
      ...(styles === undefined ? {} : { styles }),
    });
    replacementCount += 1;
    index += matchedLength;
  }
  flushBuffer();
  return { segments, replacementCount };
}

function readEnabledStyles(
  styles: PageTextReplacePair["styles"],
): Partial<Record<PageTextReplaceStyleId, boolean>> | undefined {
  const enabled: Partial<Record<PageTextReplaceStyleId, boolean>> = {};
  for (const key of PAGE_TEXT_REPLACE_STYLE_IDS) {
    if (styles[key] === true) {
      enabled[key] = true;
    }
  }
  return Object.keys(enabled).length > 0 ? enabled : undefined;
}

export const PAGE_TEXT_REPLACE_STYLE_IDS: readonly PageTextReplaceStyleId[] = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "allCaps",
  "smallCaps",
  "highlight",
];

export function normalizePageTextReplacePair(
  value: unknown,
  fallbackId: string,
): PageTextReplacePair | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const find = readString(value.find);
  const replace = readString(value.replace);
  if (find === undefined || replace === undefined) {
    return undefined;
  }
  const id =
    readString(value.id) ??
    fallbackId;
  return {
    id,
    find,
    replace,
    enabled: value.enabled !== false,
    wholeWord: value.wholeWord !== false,
    caseSensitive: value.caseSensitive === true,
    caseMode: value.caseMode === "matchSource" ? "matchSource" : "literal",
    styles: readStyles(value.styles),
  };
}

export function normalizePageTextReplaceRules(
  value: unknown,
): PageTextReplaceRules {
  if (!isRecord(value) || !Array.isArray(value.pairs)) {
    return { pairs: [] };
  }
  const pairs: PageTextReplacePair[] = [];
  value.pairs.forEach((entry, index) => {
    const pair = normalizePageTextReplacePair(entry, `pair-${index + 1}`);
    if (pair !== undefined) {
      pairs.push(pair);
    }
  });
  return { pairs };
}

function readStyles(value: unknown): PageTextReplacePair["styles"] {
  if (!isRecord(value)) {
    return {};
  }
  const styles: PageTextReplacePair["styles"] = {};
  for (const key of PAGE_TEXT_REPLACE_STYLE_IDS) {
    if (value[key] === true) {
      styles[key] = true;
    }
  }
  return styles;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
