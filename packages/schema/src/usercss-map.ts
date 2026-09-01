import { compileUserCss } from "./css.js";

export const USER_CSS_HIDE_CAPABILITY = "visual.hide" as const;

export interface UserCssHideMapping {
  readonly capability: typeof USER_CSS_HIDE_CAPABILITY;
  readonly selector: string;
  readonly declaration: string;
}

export interface MappedUserCss {
  readonly hides: readonly UserCssHideMapping[];
  readonly apply: string;
}

const HIDE_PROPERTIES = new Set([
  "display",
  "visibility",
  "content-visibility",
]);

export function mapUserCss(cssText: string, pageUrl?: string): MappedUserCss {
  const compiled = compileUserCss(cssText, pageUrl);
  const hides: UserCssHideMapping[] = [];
  const leftover: string[] = [];

  for (const rule of splitTopLevelRules(compiled)) {
    if (rule.atRule) {
      leftover.push(rule.raw);
      continue;
    }
    const classified = classifyStyleRule(rule.selector, rule.body);
    if (classified === undefined) {
      leftover.push(rule.raw);
      continue;
    }
    hides.push(...classified.hides);
    if (classified.leftoverBody.trim() !== "") {
      leftover.push(`${classified.selector} { ${classified.leftoverBody} }`);
    }
  }

  if (hides.length === 0) {
    return { hides: [], apply: compiled };
  }

  return {
    hides,
    apply: leftover.join("\n"),
  };
}

export function cssFromMappedUserCss(mapped: MappedUserCss): string {
  const hideCss = mapped.hides
    .map((hide) => `${hide.selector} { ${hide.declaration}; }`)
    .join("\n");
  return [hideCss, mapped.apply].filter((part) => part.trim() !== "").join("\n");
}

interface TopLevelRule {
  readonly selector: string;
  readonly body: string;
  readonly raw: string;
  readonly atRule: boolean;
}

function splitTopLevelRules(cssText: string): TopLevelRule[] {
  const rules: TopLevelRule[] = [];
  let cursor = 0;
  while (cursor < cssText.length) {
    cursor = skipTrivia(cssText, cursor);
    if (cursor >= cssText.length) {
      break;
    }
    const nextBrace = indexOfUnquoted(cssText, "{", cursor);
    const nextSemi = indexOfUnquoted(cssText, ";", cursor);
    if (nextBrace < 0) {
      const rest = cssText.slice(cursor).trim();
      if (rest !== "") {
        rules.push({
          selector: rest,
          body: "",
          raw: cssText.slice(cursor),
          atRule: rest.startsWith("@"),
        });
      }
      break;
    }
    if (nextSemi >= 0 && nextSemi < nextBrace) {
      const raw = cssText.slice(cursor, nextSemi + 1);
      const prelude = raw.trim();
      if (prelude !== "") {
        rules.push({
          selector: prelude,
          body: "",
          raw,
          atRule: prelude.startsWith("@"),
        });
      }
      cursor = nextSemi + 1;
      continue;
    }
    const close = findMatchingBrace(cssText, nextBrace);
    if (close < 0) {
      leftoverMalformed(rules, cssText.slice(cursor));
      break;
    }
    const selector = cssText.slice(cursor, nextBrace).trim();
    const body = cssText.slice(nextBrace + 1, close);
    const raw = cssText.slice(cursor, close + 1);
    rules.push({
      selector,
      body,
      raw,
      atRule: selector.startsWith("@"),
    });
    cursor = close + 1;
  }
  return rules;
}

function leftoverMalformed(rules: TopLevelRule[], raw: string): void {
  if (raw.trim() === "") {
    return;
  }
  rules.push({
    selector: raw.trim(),
    body: "",
    raw,
    atRule: true,
  });
}

function classifyStyleRule(
  selector: string,
  body: string,
): { selector: string; hides: UserCssHideMapping[]; leftoverBody: string } | undefined {
  if (!isSafeSelector(selector)) {
    return undefined;
  }
  const hides: UserCssHideMapping[] = [];
  const leftover: string[] = [];
  for (const declaration of splitDeclarations(body)) {
    if (isHideDeclaration(declaration)) {
      hides.push({
        capability: USER_CSS_HIDE_CAPABILITY,
        selector,
        declaration,
      });
      continue;
    }
    leftover.push(declaration);
  }
  if (hides.length === 0) {
    return undefined;
  }
  return {
    selector,
    hides,
    leftoverBody: leftover.join("; "),
  };
}

function isHideDeclaration(declaration: string): boolean {
  const colon = declaration.indexOf(":");
  if (colon < 0) {
    return false;
  }
  const property = declaration.slice(0, colon).trim().toLowerCase();
  const value = declaration
    .slice(colon + 1)
    .replace(/!important/giu, "")
    .trim()
    .toLowerCase();
  if (!HIDE_PROPERTIES.has(property)) {
    return false;
  }
  if (property === "display") {
    return value === "none";
  }
  return value === "hidden";
}

function isSafeSelector(selector: string): boolean {
  return (
    selector !== "" &&
    !selector.startsWith("@") &&
    !selector.includes("{") &&
    !selector.includes("}") &&
    !/@|url\s*\(/iu.test(selector)
  );
}

function splitDeclarations(body: string): string[] {
  const declarations: string[] = [];
  let start = 0;
  let depth = 0;
  let inString: string | undefined;
  let escaped = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
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
    if (character === "/" && body[index + 1] === "*") {
      const end = body.indexOf("*/", index + 2);
      if (end < 0) {
        break;
      }
      index = end + 1;
      continue;
    }
    if (character === '"' || character === "'") {
      inString = character;
      continue;
    }
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      depth -= 1;
      continue;
    }
    if (character === ";" && depth === 0) {
      const piece = body.slice(start, index).trim();
      if (piece !== "") {
        declarations.push(stripDeclarationComments(piece));
      }
      start = index + 1;
    }
  }
  const tail = stripDeclarationComments(body.slice(start).trim());
  if (tail !== "") {
    declarations.push(tail);
  }
  return declarations;
}

function stripDeclarationComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?(?:\*\/|$)/gu, "").trim();
}

function skipTrivia(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    const character = source[index];
    if (character === undefined) {
      break;
    }
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) {
        return source.length;
      }
      index = end + 2;
      continue;
    }
    break;
  }
  return index;
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
