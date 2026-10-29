export type BrowserFamily = "chromium" | "firefox" | "firefox-android" | "other";

/** Parse User-Agent for install-page ordering (server-safe, no DOM). */
export function detectBrowserFromUserAgent(userAgent: string): BrowserFamily {
  const ua = userAgent.trim();
  if (ua.length === 0) {
    return "other";
  }

  const isAndroid = /Android/i.test(ua);
  const isFirefox =
    /Firefox/i.test(ua) && !/Seamonkey/i.test(ua) && !/Waterfox/i.test(ua);

  if (isAndroid && isFirefox) {
    return "firefox-android";
  }
  if (isFirefox) {
    return "firefox";
  }

  if (
    /Edg\//i.test(ua) ||
    /OPR\//i.test(ua) ||
    /Chrome\//i.test(ua) ||
    /Chromium\//i.test(ua) ||
    /CriOS\//i.test(ua)
  ) {
    return "chromium";
  }

  return "other";
}

export function browserFamilyLabel(family: BrowserFamily): string {
  switch (family) {
    case "chromium":
      return "Chromium";
    case "firefox":
      return "Firefox";
    case "firefox-android":
      return "Firefox for Android";
    default:
      return "your browser";
  }
}
