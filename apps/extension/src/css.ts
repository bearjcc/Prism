const UNSAFE_CSS = [
  { pattern: /\burl\s*\(/iu, label: "url(" },
  { pattern: /@import\b/iu, label: "@import" },
  { pattern: /@(?:updateURL|downloadURL)\b/iu, label: "update URL" },
] as const;

export function sanitiseCss(cssText: string): string {
  const inspectionText = decodeCssEscapes(cssText);
  for (const unsafe of UNSAFE_CSS) {
    if (unsafe.pattern.test(inspectionText)) {
      throw new Error(`CSS contains forbidden ${unsafe.label}`);
    }
  }
  return cssText;
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
