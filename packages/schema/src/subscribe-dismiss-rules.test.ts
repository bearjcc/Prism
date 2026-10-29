import { describe, expect, test } from "vitest";
import { parseSubscribeDismissRulesJson } from "./subscribe-dismiss-rules.js";

describe("subscribe dismiss rules", () => {
  test("accepts match and markup entries", () => {
    const rules = parseSubscribeDismissRulesJson(`{
      "sites": [
        {
          "match": "https://medium.com",
          "modal": "#dialog",
          "dismiss": "#close"
        },
        {
          "markup": "substack",
          "modal": "#subscribe-popup",
          "backdrop": ".backdrop"
        }
      ]
    }`);
    expect(Array.isArray(rules)).toBe(false);
    if (Array.isArray(rules)) {
      return;
    }
    expect(rules.sites).toHaveLength(2);
  });

  test("rejects entries without match or markup", () => {
    const issues = parseSubscribeDismissRulesJson(`{
      "sites": [{ "modal": "#only" }]
    }`);
    expect(Array.isArray(issues)).toBe(true);
  });
});
