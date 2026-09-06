export type CssFindingKind = "css";

export interface CssFinding {
  readonly kind: CssFindingKind;
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

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

export function inspectCssText(file: string, source: string): CssFinding[] {
  const findings: CssFinding[] = [];
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

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split(/\r?\n/u).length;
}
