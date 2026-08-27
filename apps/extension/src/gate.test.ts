import { describe, expect, test, vi } from "vitest";
import type { PrismManifest } from "@prism/schema";
import {
  CapabilityDeniedError,
  createCapabilityGate,
} from "./gate.js";

const manifest: PrismManifest = {
  id: "example.mod",
  version: "1.0.0",
  runtime: "native",
  capabilities: {
    required: ["visual.hide"],
    optional: ["reddit.comments.search"],
  },
  scopes: ["https://www.youtube.com/*"],
};

describe("capability gate", () => {
  test("throws when a declared required capability has no grant", () => {
    const gate = createCapabilityGate({ manifest, grants: [] });

    expect(() => gate.assert("visual.hide")).toThrow(CapabilityDeniedError);
  });

  test("throws when an optional capability grant is off", () => {
    const gate = createCapabilityGate({
      manifest,
      grants: ["visual.hide"],
    });

    expect(() => gate.assert("reddit.comments.search")).toThrow(
      CapabilityDeniedError,
    );
  });

  test("throws when the mod did not declare the capability", () => {
    const gate = createCapabilityGate({
      manifest,
      grants: ["network.browser.block"],
    });

    expect(() => gate.assert("network.browser.block")).toThrow(
      CapabilityDeniedError,
    );
  });

  test("returns after a declared capability is granted", () => {
    const gate = createCapabilityGate({
      manifest,
      grants: ["visual.hide"],
    });

    expect(gate.assert("visual.hide")).toBeUndefined();
  });

  test("allows only declared egress contracts with an egress grant", () => {
    const gate = createCapabilityGate({
      manifest: {
        ...manifest,
        capabilities: {
          required: ["network.egress"],
        },
        egress: {
          contracts: [{ id: "comments", url: "https://reddit.com/*" }],
        },
      },
      grants: ["network.egress"],
    });

    expect(gate.assertEgressContract("comments")).toBeUndefined();
    expect(() => gate.assertEgressContract("undeclared")).toThrow(
      CapabilityDeniedError,
    );
  });

  test("emits the layer, mod id, capability, and outcome for every decision", () => {
    const emit = vi.fn();
    const gate = createCapabilityGate({
      manifest,
      grants: ["visual.hide"],
      emit,
    });

    gate.assert("visual.hide");
    expect(() => gate.assert("reddit.comments.search")).toThrow();

    expect(emit).toHaveBeenNthCalledWith(1, {
      layer: "capability-gate",
      modId: "example.mod",
      capability: "visual.hide",
      outcome: "allowed",
    });
    expect(emit).toHaveBeenNthCalledWith(2, {
      layer: "capability-gate",
      modId: "example.mod",
      capability: "reddit.comments.search",
      outcome: "denied",
    });
  });
});
