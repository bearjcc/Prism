import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TextEncoder } from "node:util";
import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import {
  AGE_GATE_SUPPRESSED_MARK,
  installAgeGateAutoConfirm,
} from "./age-gate-auto-confirm.js";

const modRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "mods",
  "age-gate-auto-confirm",
);

function rulesFiles(json: string): Readonly<Record<string, Uint8Array>> {
  return { "rules/sites.json": new TextEncoder().encode(json) };
}

const manifest = {
  id: "prism.age-gate-auto-confirm",
  version: "1.0.0",
  runtime: "native" as const,
  capabilities: { required: ["site.ageGate.autoConfirm"] as const },
  scopes: ["<all_urls>"],
};

describe("age gate auto-confirm", () => {
  test("applies site storage before the gate script runs", () => {
    const dom = new JSDOM(
      readFileSync(join(modRoot, "fixtures", "storage-gate.html"), "utf8"),
      { url: "https://fixture.test/", runScripts: "dangerously" },
    );
    const emit = vi.fn();
    installAgeGateAutoConfirm({
      contentDocument: dom.window.document,
      pageUrl: "https://fixture.test/",
      manifest,
      modFiles: rulesFiles(`{
        "sites": [{
          "match": "https://fixture.test",
          "localStorage": { "fixtureAgeOk": "yes" }
        }]
      }`),
      emit,
    });
    expect(dom.window.localStorage.getItem("fixtureAgeOk")).toBe("yes");
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    expect(dom.window.document.getElementById("gate")).toBeNull();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ageGate.storage", outcome: "applied" }),
    );
  });

  test("clicks an affirmative enter button for generic heuristics", () => {
    const dom = new JSDOM(
      readFileSync(join(modRoot, "fixtures", "button-gate.html"), "utf8"),
      { url: "https://heuristic.test/", runScripts: "dangerously" },
    );
    const emit = vi.fn();
    installAgeGateAutoConfirm({
      contentDocument: dom.window.document,
      pageUrl: "https://heuristic.test/",
      manifest,
      modFiles: rulesFiles(`{ "sites": [] }`),
      emit,
    });
    expect(dom.window.document.getElementById("gate")).toBeNull();
    expect(dom.window.document.getElementById("content")?.hasAttribute("hidden")).toBe(
      false,
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ageGate.genericConfirm",
        outcome: "applied",
      }),
    );
  });

  test("hides a declared overlay when no confirm control exists", () => {
    const dom = new JSDOM(
      readFileSync(join(modRoot, "fixtures", "overlay-gate.html"), "utf8"),
      { url: "https://overlay.test/" },
    );
    installAgeGateAutoConfirm({
      contentDocument: dom.window.document,
      pageUrl: "https://overlay.test/",
      manifest,
      modFiles: rulesFiles(`{
        "sites": [{
          "match": "https://overlay.test",
          "overlay": "#overlay"
        }]
      }`),
    });
    const overlay = dom.window.document.getElementById("overlay");
    expect(overlay?.hasAttribute(AGE_GATE_SUPPRESSED_MARK)).toBe(true);
  });

  test("skips date-of-birth gates instead of inventing data", () => {
    const dom = new JSDOM(
      readFileSync(join(modRoot, "fixtures", "dob-gate.html"), "utf8"),
      { url: "https://dob.test/" },
    );
    const emit = vi.fn();
    installAgeGateAutoConfirm({
      contentDocument: dom.window.document,
      pageUrl: "https://dob.test/",
      manifest,
      modFiles: rulesFiles(`{ "sites": [] }`),
      emit,
    });
    expect(dom.window.document.getElementById("gate")?.hasAttribute(AGE_GATE_SUPPRESSED_MARK)).toBe(
      true,
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ageGate.heuristicSkip", outcome: "skipped" }),
    );
    expect(emit).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "ageGate.genericConfirm" }),
    );
  });

  test("does not touch a non-age newsletter modal", () => {
    const dom = new JSDOM(
      readFileSync(join(modRoot, "fixtures", "newsletter-modal.html"), "utf8"),
      { url: "https://news.test/" },
    );
    const emit = vi.fn();
    installAgeGateAutoConfirm({
      contentDocument: dom.window.document,
      pageUrl: "https://news.test/",
      manifest,
      modFiles: rulesFiles(`{ "sites": [] }`),
      emit,
    });
    expect(dom.window.document.getElementById("newsletter")).not.toBeNull();
    expect(emit).not.toHaveBeenCalled();
  });
});
