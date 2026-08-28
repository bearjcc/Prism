import { describe, expect, test } from "vitest";
import { compileBrowserFilters } from "./dnr.js";

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
});
