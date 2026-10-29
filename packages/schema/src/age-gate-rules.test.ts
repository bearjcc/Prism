import { describe, expect, test } from "vitest";
import {
  findAgeGateSiteRule,
  isSafeModSelector,
  parseAgeGateRulesJson,
} from "./age-gate-rules.js";

describe("age gate rules", () => {
  test("accepts a minimal site entry", () => {
    const rules = parseAgeGateRulesJson(`{
      "sites": [
        {
          "match": "https://www.example.com",
          "localStorage": { "ageOk": "1" }
        }
      ]
    }`);
    expect(Array.isArray(rules)).toBe(false);
    if (Array.isArray(rules)) {
      return;
    }
    expect(rules.sites[0]?.match).toBe("https://www.example.com");
    expect(findAgeGateSiteRule(rules.sites, "https://www.example.com/page")).toEqual(
      rules.sites[0],
    );
  });

  test("rejects unsafe selectors and empty entries", () => {
    const issues = parseAgeGateRulesJson(`{
      "sites": [
        {
          "match": "https://evil.example",
          "confirm": "button@bad"
        }
      ]
    }`);
    expect(Array.isArray(issues)).toBe(true);
  });

  test("validates cookie names and storage keys", () => {
    const rules = parseAgeGateRulesJson(`{
      "sites": [
        {
          "match": "https://fixture.test",
          "cookies": [{ "name": "age_gate", "value": "yes", "maxAgeDays": 30 }],
          "confirm": "#enter",
          "overlay": "#overlay"
        }
      ]
    }`);
    expect(Array.isArray(rules)).toBe(false);
    expect(isSafeModSelector("#enter")).toBe(true);
    expect(isSafeModSelector("")).toBe(false);
  });
});
