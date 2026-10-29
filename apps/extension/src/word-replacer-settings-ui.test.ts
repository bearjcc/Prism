import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import { mountWordReplacerSettings } from "./word-replacer-settings-ui.js";

describe("word replacer settings UI", () => {
  test("loads settings and renders preview", async () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === "get-word-replacer-settings") {
        return {
          previewSample: "scuba",
          pairs: [
            {
              id: "1",
              find: "scuba",
              replace: "SCUBA",
              enabled: true,
              wholeWord: true,
              caseSensitive: false,
              caseMode: "literal",
              styles: {},
            },
          ],
        };
      }
      return { ok: true };
    });
    const root = mountWordReplacerSettings(
      { runtime: { sendMessage } },
      dom.window.document,
    );
    dom.window.document.body.append(root);
    await Promise.resolve();
    expect(root.querySelector(".word-replacer-preview-host")?.textContent).toBe(
      "SCUBA",
    );
    expect(sendMessage).toHaveBeenCalledWith({ type: "get-word-replacer-settings" });
  });
});
