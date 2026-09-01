import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { composite, contrastRatio, parseCssColor, parseOklch } from "./wcag-contrast";

const root = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(root, "../app/tokens.css"), "utf8");
const homeCss = readFileSync(join(root, "../app/home.module.css"), "utf8");
const globals = readFileSync(join(root, "../app/globals.css"), "utf8");

const AA = 4.5;

function cssVar(source: string, name: string): string {
  const re = new RegExp(`${name}:\\s*([^;]+);`);
  const m = source.match(re);
  if (!m) {
    throw new Error(`missing ${name}`);
  }
  return m[1].trim();
}

function block(source: string, selector: string): string {
  const idx = source.indexOf(selector);
  if (idx < 0) {
    throw new Error(`missing ${selector}`);
  }
  const start = source.indexOf("{", idx);
  const end = source.indexOf("}", start);
  return source.slice(start, end);
}

describe("WCAG AA contrast", () => {
  const black = parseCssColor("#050506");
  const homeText = parseOklch("oklch(0.98 0 0)");
  const blurb = parseOklch("oklch(0.86 0.008 268)");
  const footer = parseOklch("oklch(0.78 0.008 268)");
  const chalk = parseOklch("oklch(0.93 0.03 92)");
  const arrow = parseOklch("oklch(0.82 0.04 92)");

  it("keeps home type on black above AA", () => {
    expect(contrastRatio(homeText, black)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(blurb, black)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(footer, black)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(chalk, black)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(arrow, black)).toBeGreaterThanOrEqual(AA);
  });

  it("pairs each slab ink with its hue without washed body opacity", () => {
    expect(homeCss).toMatch(/\.slab p \{[^}]*color:\s*var\(--slab-ink\)/s);
    expect(homeCss).not.toMatch(/\.slab p \{[^}]*opacity:/s);

    const lanes = ["red", "yellow", "green", "blue", "magenta"] as const;
    for (const lane of lanes) {
      const hue = parseCssColor(cssVar(tokens, `--spectrum-${lane}`));
      const ink = parseCssColor(cssVar(tokens, `--ink-${lane}`));
      expect(contrastRatio(ink, hue), lane).toBeGreaterThanOrEqual(AA);
    }
  });

  it("keeps inner muted and link text at AA on light and dark surfaces", () => {
    const light = block(tokens, '[data-surface="site"][data-theme="light"]');
    const dark = block(tokens, '[data-surface="site"][data-theme="dark"]');
    const lightBg = parseCssColor(cssVar(light, "--bg"));
    const lightMuted = parseCssColor(cssVar(light, "--muted"));
    const lightText = parseCssColor(cssVar(light, "--text"));
    const lightLink = parseCssColor(cssVar(light, "--link"));
    const card = parseCssColor("#fff");
    const darkBg = parseCssColor(cssVar(dark, "--bg"));
    const darkMuted = parseCssColor(cssVar(dark, "--muted"));
    const darkText = parseCssColor(cssVar(dark, "--text"));
    const darkLink = parseCssColor(cssVar(dark, "--link"));
    const darkCard = parseCssColor(cssVar(dark, "--card"));
    const err = parseOklch("oklch(0.45 0.19 27)");
    const errDark = parseOklch("oklch(0.78 0.12 27)");

    expect(contrastRatio(lightMuted, lightBg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(lightMuted, card)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(lightText, lightBg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(lightLink, lightBg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(err, lightBg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(darkMuted, darkBg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(darkMuted, darkCard)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(darkText, darkBg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(darkLink, darkBg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(errDark, darkBg)).toBeGreaterThanOrEqual(AA);
  });

  it("does not dim inner muted copy with a second opacity", () => {
    expect(globals).not.toMatch(/\.toolbar-label \{[^}]*opacity:/s);
    expect(globals).not.toMatch(/\.card-meta p \{[^}]*opacity:/s);
    expect(globals).not.toMatch(/\.empty \{[^}]*opacity:/s);
    expect(globals).not.toMatch(/\.note \{[^}]*opacity:/s);
  });

  it("keeps inner control text at AA on card and inverted fills", () => {
    const light = block(tokens, '[data-surface="site"][data-theme="light"]');
    const dark = block(tokens, '[data-surface="site"][data-theme="dark"]');
    const lightBg = parseCssColor(cssVar(light, "--bg"));
    const lightText = parseCssColor(cssVar(light, "--text"));
    const card = parseCssColor("#fff");
    const darkBg = parseCssColor(cssVar(dark, "--bg"));
    const darkText = parseCssColor(cssVar(dark, "--text"));
    const darkCard = parseCssColor(cssVar(dark, "--card"));

    expect(contrastRatio(lightText, card)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(lightBg, lightText)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(darkText, darkCard)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(darkBg, darkText)).toBeGreaterThanOrEqual(AA);

    const solidHover = composite(lightText, lightBg, 0.92);
    expect(contrastRatio(lightBg, solidHover)).toBeGreaterThanOrEqual(AA);
    const solidHoverDark = composite(darkText, darkBg, 0.92);
    expect(contrastRatio(darkBg, solidHoverDark)).toBeGreaterThanOrEqual(AA);
  });

  it("binds inner buttons and fields to contrast tokens", () => {
    expect(globals).toMatch(/\.btn \{[^}]*background:\s*var\(--card/s);
    expect(globals).toMatch(/\.btn \{[^}]*color:\s*inherit/s);
    expect(globals).toMatch(/\.btn-solid \{[^}]*background:\s*var\(--text\)/s);
    expect(globals).toMatch(/\.btn-solid \{[^}]*color:\s*var\(--bg\)/s);
    expect(globals).toMatch(/\.search \{[^}]*background:\s*var\(--card/s);
    expect(globals).toMatch(/\.search \{[^}]*color:\s*inherit/s);
    expect(globals).toMatch(
      /\.tabs button\[aria-pressed="true"\][^}]*background:\s*var\(--text\)/s,
    );
    expect(globals).toMatch(/\.tabs button\[aria-pressed="true"\][^}]*color:\s*var\(--bg\)/s);
  });
});
