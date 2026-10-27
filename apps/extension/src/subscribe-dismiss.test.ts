import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TextEncoder } from "node:util";
import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import { MODAL_DISMISS_SUPPRESSED_MARK } from "./site-modal-dismiss.js";
import { installSubscribeDismiss } from "./subscribe-dismiss.js";

const modRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "mods",
  "subscribe-modal-dismiss",
);

const manifest = {
  id: "prism.subscribe-modal-dismiss",
  version: "1.0.0",
  runtime: "native" as const,
  capabilities: { required: ["site.subscribe.dismiss"] as const },
  scopes: ["<all_urls>"],
};

function rulesFiles(json: string): Readonly<Record<string, Uint8Array>> {
  return { "rules/sites.json": new TextEncoder().encode(json) };
}

describe("subscribe modal dismiss", () => {
  test("clicks no thanks on a Medium-shaped subscribe dialog", () => {
    const dom = new JSDOM(
      readFileSync(join(modRoot, "fixtures", "medium-subscribe.html"), "utf8"),
      { url: "https://medium.com/p/example", runScripts: "dangerously" },
    );
    installSubscribeDismiss({
      contentDocument: dom.window.document,
      pageUrl: "https://medium.com/p/example",
      manifest,
      modFiles: rulesFiles(`{ "sites": [] }`),
    });
    expect(dom.window.document.getElementById("medium-dialog")).toBeNull();
    expect(dom.window.document.querySelector("[data-prism-subscribe-backdrop]")).toBeNull();
  });

  test("hides a generic newsletter modal and backdrop", () => {
    const dom = new JSDOM(
      readFileSync(join(modRoot, "fixtures", "generic-newsletter.html"), "utf8"),
      { url: "https://publisher.test/article" },
    );
    const emit = vi.fn();
    installSubscribeDismiss({
      contentDocument: dom.window.document,
      pageUrl: "https://publisher.test/article",
      manifest,
      modFiles: rulesFiles(`{ "sites": [] }`),
      emit,
    });
    const modal = dom.window.document.querySelector("[data-prism-subscribe-modal]");
    expect(modal?.hasAttribute(MODAL_DISMISS_SUPPRESSED_MARK)).toBe(true);
    expect(
      dom.window.document
        .querySelector("[data-prism-subscribe-backdrop]")
        ?.hasAttribute(MODAL_DISMISS_SUPPRESSED_MARK),
    ).toBe(true);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "subscribe.heuristicHide", outcome: "applied" }),
    );
  });

  test("does not touch login, checkout, cookie, or nav fixtures", () => {
    for (const name of [
      "login-modal.html",
      "checkout-modal.html",
      "cookie-banner.html",
      "nav-drawer.html",
    ]) {
      const dom = new JSDOM(
        readFileSync(join(modRoot, "fixtures", name), "utf8"),
        { url: "https://negative.test/" },
      );
      const emit = vi.fn();
      installSubscribeDismiss({
        contentDocument: dom.window.document,
        pageUrl: "https://negative.test/",
        manifest,
        modFiles: rulesFiles(`{ "sites": [] }`),
        emit,
      });
      expect(
        dom.window.document.querySelector(`[${MODAL_DISMISS_SUPPRESSED_MARK}]`),
      ).toBeNull();
      expect(emit).not.toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "applied" }),
      );
    }
  });

  test("applies declarative selectors from rules", () => {
    const dom = new JSDOM(
      `<body><div id="m"></div><div id="b"></div></body>`,
      { url: "https://rules.test/" },
    );
    installSubscribeDismiss({
      contentDocument: dom.window.document,
      pageUrl: "https://rules.test/",
      manifest,
      modFiles: rulesFiles(`{
        "sites": [{
          "match": "https://rules.test",
          "modal": "#m",
          "backdrop": "#b"
        }]
      }`),
    });
    expect(
      dom.window.document.getElementById("m")?.hasAttribute(MODAL_DISMISS_SUPPRESSED_MARK),
    ).toBe(true);
    expect(
      dom.window.document.getElementById("b")?.hasAttribute(MODAL_DISMISS_SUPPRESSED_MARK),
    ).toBe(true);
  });
});
