import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { runNativeModInSandbox } from "./sandbox-runtime.js";

describe("native mod sandbox", () => {
  test("uses scripts without same-origin access and removes the frame", async () => {
    const dom = new JSDOM("<body><input value='secret'></body>", {
      url: "https://example.test/",
    });
    const prism = {
      slots: { replace: () => undefined },
      styles: { apply: () => undefined },
      ui: { allowlist: () => undefined },
      extract: async () => undefined,
      net: { request: async () => ({ status: 0, fields: {} }) },
    };
    const running = runNativeModInSandbox(
      "export function activate(prism) { return document.body; }",
      prism,
      dom.window.document,
    );
    const iframe = dom.window.document.querySelector("iframe");

    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe?.srcdoc).toContain("connect-src 'none'");
    expect(iframe?.srcdoc).not.toContain("allow-same-origin");

    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        source: iframe?.contentWindow,
        data: { kind: "sandbox-ready" },
      }),
    );
    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        source: iframe?.contentWindow,
        data: { kind: "sandbox-complete" },
      }),
    );

    await expect(running).resolves.toBeUndefined();
    expect(dom.window.document.querySelector("iframe")).toBeNull();
  });
});
