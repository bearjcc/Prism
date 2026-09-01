import type { PrismManifest } from "@prism/schema";
import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import { userscriptRegistrations, type BundledMod } from "./loader.js";
import {
  describeModKind,
  describeUserscriptRequirement,
  mountPopup,
} from "./popup.js";

const nativeManifest: PrismManifest = {
  id: "fixture.native",
  version: "1.0.0",
  runtime: "native",
  capabilities: { required: [] },
  scopes: ["https://example.com/*"],
};

const userscriptManifest: PrismManifest = {
  id: "fixture.userscript",
  version: "1.0.0",
  runtime: "userscript",
  capabilities: { required: [] },
  scopes: ["https://example.com/*"],
};

function userscriptMod(
  source: string,
  scopes: readonly string[] = userscriptManifest.scopes,
): BundledMod {
  return {
    manifest: { ...userscriptManifest, scopes: [...scopes] },
    entry: "imported/fixture.userscript/src/index.js",
    entrySource: source,
  };
}

describe("Phase O restricted userscript world", () => {
  test("native runtime packages with JS source are not registered", () => {
    const registrations = userscriptRegistrations(
      [
        {
          manifest: nativeManifest,
          entry: "src/index.js",
          entrySource: "export const native = true;",
        },
        userscriptMod("document.title = 'ok';"),
      ],
      {},
    );
    expect(registrations.map((entry) => entry.id)).toEqual([
      "fixture.userscript",
    ]);
  });

  test("userscript registrations use USER_SCRIPT world and never MAIN", () => {
    const registrations = userscriptRegistrations(
      [userscriptMod("document.title = 'ok';")],
      {},
    );
    expect(registrations).toHaveLength(1);
    const [script] = registrations;
    expect(script).toMatchObject({
      id: "fixture.userscript",
      world: "USER_SCRIPT",
      matches: ["https://example.com/*"],
      js: [{ code: "document.title = 'ok';" }],
    });
    expect(script?.world).not.toBe("MAIN");
    expect(JSON.stringify(registrations)).not.toMatch(/"MAIN"/u);
  });

  test("matches are exactly the package scopes", () => {
    const scopes = ["https://example.com/*", "https://www.example.com/*"];
    const registrations = userscriptRegistrations(
      [userscriptMod("void 0;", scopes)],
      {},
    );
    expect(registrations[0]?.matches).toEqual(scopes);
  });

  test("refuses Greasemonkey remote @require script URLs", () => {
    const source = `// ==UserScript==
// @name fixture
// @require https://cdn.example/lib.js
// ==/UserScript==
document.title = 'ok';`;
    expect(userscriptRegistrations([userscriptMod(source)], {})).toEqual([]);

    const httpRequire = `// ==UserScript==
// @require http://cdn.example/lib.js
// ==/UserScript==
`;
    expect(
      userscriptRegistrations([userscriptMod(httpRequire)], {}),
    ).toEqual([]);
  });

  test("refuses remote dynamic import and fetch of a .js URL", () => {
    expect(
      userscriptRegistrations(
        [userscriptMod('import("https://cdn.example/mod.js");')],
        {},
      ),
    ).toEqual([]);
    expect(
      userscriptRegistrations(
        [userscriptMod("fetch('https://cdn.example/vendor.js');")],
        {},
      ),
    ).toEqual([]);
  });

  test("does not register matches covering hosts outside declared scopes", () => {
    const registrations = userscriptRegistrations(
      [userscriptMod("document.title = 'ok';")],
      {},
    );
    expect(registrations[0]?.matches).toEqual(["https://example.com/*"]);
    expect(registrations[0]?.matches.join(" ")).not.toMatch(
      /other\.example|all_urls|\*:\/\/*/u,
    );
  });

  test("popup userscript copy states isolated world, scopes, and no remote URLs", () => {
    const text = describeUserscriptRequirement();
    expect(describeModKind("userscript")).toBe("Userscript");
    expect(text).toMatch(/USER_SCRIPT/u);
    expect(text).toMatch(/isolated/iu);
    expect(text).toMatch(/scope/iu);
    expect(text).toMatch(/remote/iu);
    expect(text).toMatch(/Allow User Scripts/u);
    expect(text).not.toMatch(/\bMAIN\b/u);
    expect(text).not.toMatch(/unrestricted|Tampermonkey|Violentmonkey/iu);
  });

  test("Userscript label is not placed next to native-safe copy", async () => {
    const sendMessage = vi.fn(async (message: { readonly type?: string }) => {
      if (message.type === "list-activity") {
        return [];
      }
      if (
        message.type === "get-behaviour-policies" ||
        message.type === "get-paste-policy"
      ) {
        const policy = {
          default: true,
          denyOrigins: [],
          allow: true,
          originDenied: false,
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
      return [
        {
          manifest: nativeManifest,
          enabled: true,
          grants: [],
          trustKind: "declarative",
        },
        {
          manifest: userscriptManifest,
          enabled: true,
          grants: [],
          trustKind: "userscript",
        },
      ];
    });
    const dom = new JSDOM(`<!doctype html><p id="page-origin"></p>
      <ol id="page-activity"></ol>
      <section id="global-policies"></section>
      <main id="mods"></main>
      <ol id="activity"></ol>
      <button id="undo" type="button">Undo</button>
      <input id="import-mod" type="file">`);
    await mountPopup(
      {
        runtime: { sendMessage },
        permissions: { request: vi.fn(), remove: vi.fn() },
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 3, url: "https://example.com/" },
          ]),
        },
      },
      dom.window.document,
    );

    const sections = [
      ...dom.window.document.querySelectorAll("section.mod"),
    ];
    const nativeCard = sections.find((section) =>
      (section.textContent ?? "").includes("fixture.native"),
    );
    const userscriptCard = sections.find((section) =>
      (section.textContent ?? "").includes("fixture.userscript"),
    );
    expect(nativeCard?.querySelector(".mod-kind")?.textContent).toBe(
      "CSS + JSON",
    );
    expect(nativeCard?.textContent).not.toMatch(/Userscript/u);
    expect(userscriptCard?.querySelector(".mod-kind")?.textContent).toBe(
      "Userscript",
    );
    expect(userscriptCard?.textContent).toContain(
      describeUserscriptRequirement(),
    );
    expect(userscriptCard?.textContent).not.toMatch(
      /native-safe|first-party prism\.\*/iu,
    );
    expect(dom.window.document.body.textContent).not.toMatch(
      /\bMAIN\b|unrestricted/u,
    );
  });
});
