import type { PrismManifest } from "@prism/schema";
import { describe, expect, test, vi } from "vitest";
import {
  compileBrowserFilters,
  compileCosmeticFilters,
  cosmeticHideCss,
  PRISM_DYNAMIC_RULE_START,
  syncBrowserBlockRules,
} from "./dnr.js";

const blockManifest: PrismManifest = {
  id: "fixture.block",
  version: "1.0.0",
  runtime: "native",
  capabilities: {
    required: [],
    optional: ["network.browser.block"],
  },
  scopes: ["<all_urls>"],
  filters: {
    browser: ["filters/browser/ads.txt"],
  },
};

describe("compileBrowserFilters", () => {
  test("compiles third-party host block rules with stable ids", () => {
    const rules = compileBrowserFilters([
      `
        ! Example ad hosts
        ||ads.example.test^
        ||tracking.example.test^
      `,
    ]);

    expect(rules).toEqual([
      {
        id: 1,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: "||ads.example.test^",
          domainType: "thirdParty",
          resourceTypes: [
            "font",
            "image",
            "media",
            "object",
            "other",
            "ping",
            "script",
            "sub_frame",
            "stylesheet",
            "webbundle",
            "websocket",
            "xmlhttprequest",
          ],
        },
      },
      {
        id: 2,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: "||tracking.example.test^",
          domainType: "thirdParty",
          resourceTypes: [
            "font",
            "image",
            "media",
            "object",
            "other",
            "ping",
            "script",
            "sub_frame",
            "stylesheet",
            "webbundle",
            "websocket",
            "xmlhttprequest",
          ],
        },
      },
    ]);
  });

  test("adds excluded initiator domains for site exceptions", () => {
    expect(
      compileBrowserFilters(["||ads.example.test^"], 1, ["meet.example"]),
    ).toEqual([
      expect.objectContaining({
        condition: expect.objectContaining({
          urlFilter: "||ads.example.test^",
          excludedInitiatorDomains: ["meet.example"],
        }),
      }),
    ]);
  });

  test("compiles cosmetic hide CSS for the current host", () => {
    const instructions = compileCosmeticFilters([
      "###AdBox\nexample.test##.advert\nother.test##.promo",
    ]);
    expect(cosmeticHideCss(instructions, "www.example.test")).toContain(
      "#AdBox",
    );
    expect(cosmeticHideCss(instructions, "www.example.test")).toContain(
      ".advert",
    );
    expect(cosmeticHideCss(instructions, "www.example.test")).not.toContain(
      ".promo",
    );
  });

  test("compiles cosmetic hide instructions from ## rules", () => {
    expect(
      compileCosmeticFilters([
        `
          ! comment
          ###AdBox
          example.test##.advert
          example.test#@#.advert
          ||ads.example.test^
        `,
      ]),
    ).toEqual([
      { selector: "#AdBox" },
      { selector: ".advert", domains: ["example.test"] },
    ]);
  });

  test("ignores unsupported filters, exceptions, and duplicates", () => {
    expect(
      compileBrowserFilters([
        `
          ||ads.example.test^
          ||ads.example.test^
          @@||ads.example.test^
          example.test##.advert
          /banner-[0-9]+/
        `,
      ]),
    ).toHaveLength(1);
  });

  test("applies granted browser rules and removes them after revoke", async () => {
    const readFilter = vi.fn().mockResolvedValue("||ads.example.test^");
    const getDynamicRules = vi
      .fn()
      .mockResolvedValueOnce([{ id: PRISM_DYNAMIC_RULE_START }, { id: 9 }])
      .mockResolvedValueOnce([{ id: PRISM_DYNAMIC_RULE_START }, { id: 9 }]);
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
    const dynamicRules = { getDynamicRules, updateDynamicRules };
    const mods = [{ manifest: blockManifest, entry: null }];

    await syncBrowserBlockRules(
      mods,
      {},
      { [blockManifest.id]: ["network.browser.block"] },
      readFilter,
      dynamicRules,
    );

    expect(readFilter).toHaveBeenCalledWith(
      blockManifest.id,
      "filters/browser/ads.txt",
    );
    expect(updateDynamicRules).toHaveBeenNthCalledWith(1, {
      removeRuleIds: [PRISM_DYNAMIC_RULE_START],
      addRules: [
        expect.objectContaining({
          id: PRISM_DYNAMIC_RULE_START,
          condition: expect.objectContaining({
            urlFilter: "||ads.example.test^",
          }),
        }),
      ],
    });

    await syncBrowserBlockRules(
      mods,
      {},
      { [blockManifest.id]: [] },
      readFilter,
      dynamicRules,
    );

    expect(updateDynamicRules).toHaveBeenNthCalledWith(2, {
      removeRuleIds: [PRISM_DYNAMIC_RULE_START],
      addRules: [],
    });
  });

  test("excludes excepted origins from that mod's DNR rules", async () => {
    const readFilter = vi.fn().mockResolvedValue("||ads.example.test^");
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
    const dynamicRules = {
      getDynamicRules: vi.fn().mockResolvedValue([]),
      updateDynamicRules,
    };

    await syncBrowserBlockRules(
      [{ manifest: blockManifest, entry: null }],
      {},
      { [blockManifest.id]: ["network.browser.block"] },
      readFilter,
      dynamicRules,
      { [blockManifest.id]: ["https://meet.example"] },
    );

    expect(updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [],
      addRules: [
        expect.objectContaining({
          condition: expect.objectContaining({
            excludedInitiatorDomains: ["meet.example"],
          }),
        }),
      ],
    });
  });
});
