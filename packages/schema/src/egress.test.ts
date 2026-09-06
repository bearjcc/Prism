import { describe, expect, test } from "vitest";
import {
  defaultEgressRequestUrl,
  egressContractHostPatterns,
  hostPatternFromContractUrl,
  urlMatchesEgressContract,
} from "./egress.js";

describe("egress contract helpers", () => {
  const contract = {
    id: "remote-kitten-images",
    url: "https://cataas.com/cat*",
    methods: ["GET"],
  };

  test("derives host permission patterns from contract URLs", () => {
    expect(egressContractHostPatterns([contract])).toEqual([
      "https://cataas.com/*",
    ]);
    expect(hostPatternFromContractUrl("https://images.example.com/random")).toBe(
      "https://images.example.com/*",
    );
  });

  test("matches brokered image URLs against declared contracts", () => {
    expect(
      urlMatchesEgressContract("https://cataas.com/cat/abc123", contract),
    ).toBe(true);
    expect(
      urlMatchesEgressContract("https://other.example.test/cat", contract),
    ).toBe(false);
  });

  test("builds a default GET URL from wildcard contracts", () => {
    expect(defaultEgressRequestUrl(contract)).toBe("https://cataas.com/cat");
    expect(
      defaultEgressRequestUrl({
        id: "fixed",
        url: "https://cataas.com/cat",
      }),
    ).toBe("https://cataas.com/cat");
  });
});
