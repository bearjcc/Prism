import { describe, expect, it } from "vitest";
import { browserFamilyLabel, detectBrowserFromUserAgent } from "./browser-detect";

describe("detectBrowserFromUserAgent", () => {
  it("detects Chromium-family browsers", () => {
    expect(
      detectBrowserFromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("chromium");
    expect(
      detectBrowserFromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      ),
    ).toBe("chromium");
  });

  it("detects desktop Firefox", () => {
    expect(
      detectBrowserFromUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
      ),
    ).toBe("firefox");
  });

  it("detects Firefox for Android before desktop Firefox", () => {
    expect(
      detectBrowserFromUserAgent(
        "Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0",
      ),
    ).toBe("firefox-android");
  });

  it("returns other for empty or unknown agents", () => {
    expect(detectBrowserFromUserAgent("")).toBe("other");
    expect(detectBrowserFromUserAgent("curl/8.0")).toBe("other");
  });

  it("labels browser families for copy", () => {
    expect(browserFamilyLabel("chromium")).toMatch(/Chromium/);
    expect(browserFamilyLabel("firefox-android")).toMatch(/Android/);
  });
});
