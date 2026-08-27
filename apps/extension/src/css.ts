const UNSAFE_CSS = [
  { pattern: /\burl\s*\(/iu, label: "url(" },
  { pattern: /@import\b/iu, label: "@import" },
  { pattern: /@(?:updateURL|downloadURL)\b/iu, label: "update URL" },
] as const;

export function sanitiseCss(cssText: string): string {
  for (const unsafe of UNSAFE_CSS) {
    if (unsafe.pattern.test(cssText)) {
      throw new Error(`CSS contains forbidden ${unsafe.label}`);
    }
  }
  return cssText;
}
