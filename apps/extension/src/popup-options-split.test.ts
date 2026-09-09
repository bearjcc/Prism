import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import { mountOptions, mountPopup } from "./popup.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const chromeRoot = join(repoRoot, "apps", "extension", "targets", "chrome");

function popupDom(): JSDOM {
  const html = readFileSync(join(chromeRoot, "popup.html"), "utf8");
  return new JSDOM(html, {
    url: "chrome-extension://fixture-extension/popup.html",
  });
}

function optionsDom(): JSDOM {
  const html = readFileSync(join(chromeRoot, "options.html"), "utf8");
  return new JSDOM(html, {
    url: "chrome-extension://fixture-extension/options.html",
  });
}

function mockApi(sendMessage: ReturnType<typeof vi.fn>) {
  return {
    runtime: {
      sendMessage,
      openOptionsPage: vi.fn(),
    },
    permissions: {
      request: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(true),
    },
    tabs: {
      query: vi.fn().mockResolvedValue([
        { id: 1, url: "https://www.youtube.com/" },
      ]),
      create: vi.fn(),
    },
  };
}

function defaultSendMessage() {
  return vi.fn(async (message: { type: string }) => {
    if (message.type === "get-popup-chrome") {
      return { pinHintDismissed: true, runtimePaused: false };
    }
    if (message.type === "get-behaviour-policies") {
      const policy = {
        default: true,
        denyOrigins: [],
        allow: true,
        originDenied: false,
        sessionDeniedOnOrigin: false,
      };
      return {
        paste: policy,
        "popup-suppress": policy,
        "title-freeze": policy,
        "scroll-lock": policy,
        "overlay-suppress": policy,
        "consent-reject": policy,
        autoplay: policy,
      };
    }
    if (message.type === "list-mods") {
      return [
        {
          manifest: {
            id: "prism.youtube-home-videos",
            version: "1.0.0",
            runtime: "native",
            capabilities: { required: [], optional: ["network.egress"] },
            scopes: ["https://www.youtube.com/"],
          },
          enabled: true,
          grants: [],
        },
        {
          manifest: {
            id: "prism.youtube-reddit-comments",
            version: "1.0.0",
            runtime: "native",
            capabilities: { required: [] },
            scopes: ["https://www.youtube.com/watch*"],
          },
          enabled: false,
          grants: [],
        },
      ];
    }
    if (message.type === "list-activity") {
      return [];
    }
    return [];
  });
}

describe("popup and options split", () => {
  test("Chrome manifest declares toolbar icons and options_ui", () => {
    const manifest = JSON.parse(
      readFileSync(join(chromeRoot, "manifest.json"), "utf8"),
    ) as {
      action: {
        default_popup: string;
        default_icon: Record<string, string>;
      };
      options_ui: { page: string; open_in_tab: boolean };
    };

    expect(manifest.action.default_icon).toEqual({
      16: "icons/icon16.png",
      32: "icons/icon32.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    });
    expect(manifest.options_ui).toEqual({
      page: "options.html",
      open_in_tab: true,
    });
    for (const size of [16, 32, 48, 128]) {
      expect(
        existsSync(join(chromeRoot, "icons", `icon${size}.png`)),
      ).toBe(true);
    }
  });

  test("slim popup does not mount sections moved to options", () => {
    const popup = readFileSync(join(chromeRoot, "popup.html"), "utf8");
    expect(popup).toContain('id="mods"');
    expect(popup).toContain('id="page-activity"');
    expect(popup).toContain('id="open-options"');
    expect(popup).not.toContain('id="other-mods"');
    expect(popup).not.toContain('id="global-policies"');
    expect(popup).not.toContain('id="activity"');
    expect(popup).not.toContain('id="import-mod"');
    expect(popup).not.toContain('id="pin-hint"');
  });

  test("options page mounts moved sections", () => {
    const options = readFileSync(join(chromeRoot, "options.html"), "utf8");
    expect(options).toContain('id="other-mods"');
    expect(options).toContain('id="global-policies"');
    expect(options).toContain('id="activity"');
    expect(options).toContain('id="import-mod"');
    expect(options).toContain('id="pin-hint"');
    expect(options).toContain('src="dist/options.js"');
  });

  test("mountPopup renders matching mods without other mods or global policies", async () => {
    const dom = popupDom();
    const sendMessage = defaultSendMessage();
    await mountPopup(mockApi(sendMessage), dom.window.document);

    expect(dom.window.document.getElementById("mods")?.textContent).toContain(
      "prism.youtube-home-videos",
    );
    expect(dom.window.document.getElementById("mods")?.textContent).not.toContain(
      "prism.youtube-reddit-comments",
    );
    expect(dom.window.document.getElementById("other-mods")).toBeNull();
    expect(dom.window.document.getElementById("global-policies")).toBeNull();
    expect(dom.window.document.getElementById("activity")).toBeNull();
    expect(dom.window.document.getElementById("import-mod")).toBeNull();
    expect(
      dom.window.document.querySelector(".capabilities"),
    ).toBeNull();
  });

  test("mountOptions renders other mods, policies, import, and full activity", async () => {
    const dom = optionsDom();
    const sendMessage = defaultSendMessage();
    await mountOptions(mockApi(sendMessage), dom.window.document);

    expect(
      dom.window.document.getElementById("other-mods")?.textContent,
    ).toContain("prism.youtube-reddit-comments");
    expect(
      dom.window.document.getElementById("global-policies")?.textContent,
    ).toContain("Global policies");
    expect(dom.window.document.getElementById("import-mod")).not.toBeNull();
    expect(dom.window.document.getElementById("activity")).not.toBeNull();
    expect(
      dom.window.document.querySelector(".capabilities"),
    ).not.toBeNull();
  });

  test("popup open-options control calls runtime.openOptionsPage", async () => {
    const dom = popupDom();
    const sendMessage = defaultSendMessage();
    const api = mockApi(sendMessage);
    await mountPopup(api, dom.window.document);

    const button = dom.window.document.getElementById(
      "open-options",
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    button?.click();
    expect(api.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  });
});
