/** WCAG 2 relative luminance and contrast from CSS oklch / hex. */

export type Srgb = { r: number; g: number; b: number };

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function linearToSrgb(c: number): number {
  const abs = Math.abs(c);
  const sign = Math.sign(c);
  if (abs > 0.0031308) {
    return sign * (1.055 * abs ** (1 / 2.4) - 0.055);
  }
  return 12.92 * c;
}

export function oklchToSrgb(L: number, C: number, hDeg: number): Srgb {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return {
    r: clamp01(linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp01(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp01(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  };
}

export function parseOklch(value: string): Srgb {
  const trimmed = value.trim();
  const m = trimmed.match(
    /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i,
  );
  if (!m) {
    throw new Error(`not oklch: ${value}`);
  }
  const rgb = oklchToSrgb(Number(m[1]), Number(m[2]), Number(m[3]));
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  if (alpha < 1) {
    return composite(rgb, { r: 0, g: 0, b: 0 }, alpha);
  }
  return rgb;
}

export function parseHex(hex: string): Srgb {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return {
    r: parseInt(n.slice(0, 2), 16) / 255,
    g: parseInt(n.slice(2, 4), 16) / 255,
    b: parseInt(n.slice(4, 6), 16) / 255,
  };
}

export function composite(fg: Srgb, bg: Srgb, opacity: number): Srgb {
  return {
    r: fg.r * opacity + bg.r * (1 - opacity),
    g: fg.g * opacity + bg.g * (1 - opacity),
    b: fg.b * opacity + bg.b * (1 - opacity),
  };
}

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(c: Srgb): number {
  const r = srgbChannelToLinear(c.r);
  const g = srgbChannelToLinear(c.g);
  const b = srgbChannelToLinear(c.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Srgb, b: Srgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

export function parseCssColor(value: string): Srgb {
  const v = value.trim();
  if (v.startsWith("#")) {
    return parseHex(v);
  }
  if (v.startsWith("oklch(")) {
    return parseOklch(v);
  }
  throw new Error(`unsupported colour: ${value}`);
}
