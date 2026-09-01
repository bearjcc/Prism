const UNSAFE_CSS = [
  { pattern: /\burl\s*\(/iu, label: "url(" },
  { pattern: /@import\b/iu, label: "@import" },
  { pattern: /@(?:updateURL|downloadURL)\b/iu, label: "update URL" },
] as const;

export function sanitiseCss(cssText: string, pageUrl?: string): string {
  return compileUserCss(cssText, pageUrl);
}

export function compileUserCss(cssText: string, pageUrl?: string): string {
  const stripped = stripUserStyleMetadata(cssText);
  const sections = splitDocumentSections(stripped);
  const compiled =
    sections.blocks.length === 0
      ? stripped
      : compileDocumentSections(sections, pageUrl);
  assertSafeCss(compiled);
  return compiled;
}

function compileDocumentSections(
  sections: { prelude: string; blocks: DocumentBlock[] },
  pageUrl?: string,
): string {
  const page = pageUrl === undefined ? undefined : parsePageUrl(pageUrl);
  const compiled: string[] = [];
  if (sections.prelude.trim() !== "") {
    compiled.push(sections.prelude);
  }
  for (const block of sections.blocks) {
    if (
      page === undefined ||
      block.conditions.some((condition) => matchesCondition(condition, page))
    ) {
      compiled.push(block.css);
    }
  }
  return compiled.join("\n");
}

function assertSafeCss(cssText: string): void {
  const inspectionText = stripCssComments(decodeCssEscapes(cssText));
  for (const unsafe of UNSAFE_CSS) {
    if (unsafe.pattern.test(inspectionText)) {
      throw new Error(`CSS contains forbidden ${unsafe.label}`);
    }
  }
}

const USER_STYLE_BLOCK =
  /\/\*\s*==UserStyle==([\s\S]*?)==\/UserStyle==\s*\*\//u;
const ALLOWED_PREPROCESSORS = new Set(["", "none", "default"]);

function stripUserStyleMetadata(cssText: string): string {
  const match = USER_STYLE_BLOCK.exec(cssText);
  if (match === null) {
    return cssText;
  }
  const metadata = match[1] ?? "";
  const preprocessor =
    /@preprocessor\s+(\S+)/u.exec(metadata)?.[1]?.toLowerCase() ?? "";
  if (!ALLOWED_PREPROCESSORS.has(preprocessor)) {
    throw new Error("CSS contains forbidden preprocessor");
  }
  if (/@(?:updateURL|downloadURL)\b/u.test(metadata)) {
    throw new Error("CSS contains forbidden update URL");
  }
  return cssText.slice(0, match.index) + cssText.slice(match.index + match[0].length);
}

interface DocumentCondition {
  readonly kind: "domain" | "url" | "url-prefix" | "regexp";
  readonly value: string;
}

interface DocumentBlock {
  readonly conditions: readonly DocumentCondition[];
  readonly css: string;
}

function splitDocumentSections(cssText: string): {
  prelude: string;
  blocks: DocumentBlock[];
} {
  const blocks: DocumentBlock[] = [];
  let prelude = "";
  let cursor = 0;
  while (cursor < cssText.length) {
    const next = findDocumentRule(cssText, cursor);
    if (next < 0) {
      prelude += cssText.slice(cursor);
      break;
    }
    prelude += cssText.slice(cursor, next);
    const headerEnd = skipDocumentName(cssText, next);
    const openBrace = indexOfUnquoted(cssText, "{", headerEnd);
    if (openBrace < 0) {
      throw new Error("CSS contains a malformed @-moz-document rule");
    }
    const conditions = parseDocumentConditions(
      cssText.slice(headerEnd, openBrace),
    );
    const closeBrace = findMatchingBrace(cssText, openBrace);
    if (closeBrace < 0) {
      throw new Error("CSS contains a malformed @-moz-document rule");
    }
    blocks.push({
      conditions,
      css: cssText.slice(openBrace + 1, closeBrace),
    });
    cursor = closeBrace + 1;
  }
  return { prelude, blocks };
}

function findDocumentRule(source: string, start: number): number {
  const match = /@(?:-moz-)?document\b/iu.exec(source.slice(start));
  if (match === null || match.index === undefined) {
    return -1;
  }
  return start + match.index;
}

function skipDocumentName(source: string, atIndex: number): number {
  const match = /@(?:-moz-)?document\b/iu.exec(source.slice(atIndex));
  if (match === null || match[0] === undefined) {
    return atIndex;
  }
  return atIndex + match[0].length;
}

function parseDocumentConditions(source: string): DocumentCondition[] {
  const conditions: DocumentCondition[] = [];
  const expression =
    /(domain|url-prefix|url|regexp)\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/giu;
  for (const match of source.matchAll(expression)) {
    const kind = match[1]?.toLowerCase();
    const value = decodeCssEscapes((match[2] ?? match[3] ?? match[4] ?? "").trim());
    if (
      kind === "domain" ||
      kind === "url" ||
      kind === "url-prefix" ||
      kind === "regexp"
    ) {
      conditions.push({ kind, value });
    }
  }
  return conditions;
}

function parsePageUrl(pageUrl: string): URL {
  try {
    return new URL(pageUrl);
  } catch {
    throw new Error("UserCSS page URL is invalid");
  }
}

function matchesCondition(condition: DocumentCondition, page: URL): boolean {
  if (condition.kind === "domain") {
    const host = page.hostname.toLowerCase();
    const domain = condition.value.replace(/^\./u, "").toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  if (condition.kind === "url") {
    return page.href === condition.value;
  }
  if (condition.kind === "url-prefix") {
    return page.href.startsWith(condition.value);
  }
  if (condition.value.length > 512) {
    throw new Error("CSS contains forbidden regexp");
  }
  try {
    return new RegExp(condition.value).test(page.href);
  } catch {
    throw new Error("CSS contains forbidden regexp");
  }
}

function indexOfUnquoted(source: string, character: string, start: number): number {
  let inString: string | undefined;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const current = source[index];
    if (inString !== undefined) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === "\\") {
        escaped = true;
        continue;
      }
      if (current === inString) {
        inString = undefined;
      }
      continue;
    }
    if (current === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) {
        return -1;
      }
      index = end + 1;
      continue;
    }
    if (current === '"' || current === "'") {
      inString = current;
      continue;
    }
    if (current === character) {
      return index;
    }
  }
  return -1;
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  let inString: string | undefined;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (inString !== undefined) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === inString) {
        inString = undefined;
      }
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) {
        return -1;
      }
      index = end + 1;
      continue;
    }
    if (character === '"' || character === "'") {
      inString = character;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

export function isStyleSourcePath(archivePath: string): boolean {
  return (
    archivePath.startsWith("styles/") && /\.(?:css|less)$/iu.test(archivePath)
  );
}

function stripCssComments(cssText: string): string {
  return cssText.replace(/\/\*[\s\S]*?(?:\*\/|$)/gu, "");
}

function decodeCssEscapes(cssText: string): string {
  return cssText
    .replace(/\\(?:\r\n|[\n\r\f])/gu, "")
    .replace(
      /\\(?:([0-9a-f]{1,6})[ \t\r\n\f]?|([\s\S]))/giu,
      (_match, hex: string | undefined, escaped: string | undefined) => {
        if (hex === undefined) {
          return escaped ?? "";
        }
        const codePoint = Number.parseInt(hex, 16);
        return codePoint === 0 ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
          ? "\ufffd"
          : String.fromCodePoint(codePoint);
      },
    );
}
