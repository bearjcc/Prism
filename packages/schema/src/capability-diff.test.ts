import { describe, expect, test } from "vitest";
import { capabilityDiff } from "./capability-diff.js";
import type { EgressContract, PrismManifest } from "./manifest.js";

function manifest(
  overrides: Partial<PrismManifest> = {},
): PrismManifest {
  return {
    id: "example.mod",
    version: "1.0.0",
    runtime: "native",
    capabilities: { required: ["visual.hide"] },
    scopes: ["https://example.test/*"],
    ...overrides,
  };
}

function kittenContract(
  overrides: Partial<EgressContract> = {},
): EgressContract {
  return {
    id: "remote-images",
    url: "https://images.example.com/random",
    methods: ["GET"],
    ...overrides,
  };
}

describe("capabilityDiff", () => {
  test("returns empty increase and decrease lists for identical manifests", () => {
    const before = manifest({
      capabilities: {
        required: ["visual.hide"],
        optional: ["network.egress"],
      },
      egress: { contracts: [kittenContract()] },
    });

    expect(capabilityDiff(before, structuredClone(before))).toEqual({
      increases: [],
      decreases: [],
    });
  });

  test("reports adding a required capability as an increase", () => {
    const before = manifest({
      capabilities: { required: ["visual.hide"] },
    });
    const after = manifest({
      capabilities: {
        required: ["visual.hide", "visual.ad-slot.replace"],
      },
    });

    expect(capabilityDiff(before, after)).toEqual({
      increases: ["Adds required capability visual.ad-slot.replace."],
      decreases: [],
    });
  });

  test("reports adding an optional capability as an increase", () => {
    const before = manifest({
      capabilities: { required: ["visual.hide"] },
    });
    const after = manifest({
      capabilities: {
        required: ["visual.hide"],
        optional: ["network.egress"],
      },
    });

    expect(capabilityDiff(before, after)).toEqual({
      increases: ["Adds optional capability network.egress."],
      decreases: [],
    });
  });

  test("reports removing a required capability as a decrease", () => {
    const before = manifest({
      capabilities: {
        required: ["visual.hide", "visual.ad-slot.replace"],
      },
    });
    const after = manifest({
      capabilities: { required: ["visual.hide"] },
    });

    expect(capabilityDiff(before, after)).toEqual({
      increases: [],
      decreases: ["Removes required capability visual.ad-slot.replace."],
    });
  });

  test("reports removing an optional capability as a decrease", () => {
    const before = manifest({
      capabilities: {
        required: ["visual.hide"],
        optional: ["network.egress"],
      },
    });
    const after = manifest({
      capabilities: { required: ["visual.hide"] },
    });

    expect(capabilityDiff(before, after)).toEqual({
      increases: [],
      decreases: ["Removes optional capability network.egress."],
    });
  });

  test("reports required-to-optional as a decrease", () => {
    const before = manifest({
      capabilities: { required: ["network.egress"] },
    });
    const after = manifest({
      capabilities: {
        required: [],
        optional: ["network.egress"],
      },
    });

    expect(capabilityDiff(before, after)).toEqual({
      increases: [],
      decreases: [
        "Changes capability network.egress from required to optional.",
      ],
    });
  });

  test("reports optional-to-required as an increase", () => {
    const before = manifest({
      capabilities: {
        required: [],
        optional: ["network.egress"],
      },
    });
    const after = manifest({
      capabilities: { required: ["network.egress"] },
    });

    expect(capabilityDiff(before, after)).toEqual({
      increases: [
        "Changes capability network.egress from optional to required.",
      ],
      decreases: [],
    });
  });

  test("reports adding an egress contract as an increase", () => {
    const before = manifest();
    const after = manifest({
      egress: { contracts: [kittenContract()] },
    });

    expect(capabilityDiff(before, after)).toEqual({
      increases: ["Adds egress contract remote-images."],
      decreases: [],
    });
  });

  test("reports removing an egress contract as a decrease", () => {
    const before = manifest({
      egress: { contracts: [kittenContract()] },
    });
    const after = manifest();

    expect(capabilityDiff(before, after)).toEqual({
      increases: [],
      decreases: ["Removes egress contract remote-images."],
    });
  });

  test("reports an egress methods field change", () => {
    const before = manifest({
      egress: { contracts: [kittenContract({ methods: ["GET"] })] },
    });
    const after = manifest({
      egress: {
        contracts: [kittenContract({ methods: ["GET", "POST"] })],
      },
    });

    expect(capabilityDiff(before, after)).toEqual({
      increases: [
        "Changes egress contract remote-images methods from GET to GET, POST.",
      ],
      decreases: [],
    });
  });

  test("reports an egress methods field decrease", () => {
    const before = manifest({
      egress: {
        contracts: [kittenContract({ methods: ["GET", "POST"] })],
      },
    });
    const after = manifest({
      egress: { contracts: [kittenContract({ methods: ["GET"] })] },
    });

    expect(capabilityDiff(before, after)).toEqual({
      increases: [],
      decreases: [
        "Changes egress contract remote-images methods from GET, POST to GET.",
      ],
    });
  });

  test("reports an egress origin change", () => {
    const before = manifest({
      egress: {
        contracts: [
          kittenContract({ url: "https://images.example.com/random" }),
        ],
      },
    });
    const after = manifest({
      egress: {
        contracts: [
          kittenContract({ url: "https://cats.example.net/random" }),
        ],
      },
    });

    expect(capabilityDiff(before, after)).toEqual({
      increases: [
        "Changes egress contract remote-images origin from https://images.example.com to https://cats.example.net.",
      ],
      decreases: [],
    });
  });

  test("reports an egress URL change when the origin is unchanged", () => {
    const before = manifest({
      egress: {
        contracts: [
          kittenContract({ url: "https://images.example.com/random" }),
        ],
      },
    });
    const after = manifest({
      egress: {
        contracts: [kittenContract({ url: "https://images.example.com/v2" })],
      },
    });

    expect(capabilityDiff(before, after)).toEqual({
      increases: [
        "Changes egress contract remote-images URL from https://images.example.com/random to https://images.example.com/v2.",
      ],
      decreases: [],
    });
  });
});
