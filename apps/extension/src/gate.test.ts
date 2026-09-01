import { describe, expect, test, vi } from "vitest";
import type { PrismManifest } from "@prism/schema";
import {
  ACTIVITY_EVENT_LIMIT,
  appendActivityEvents,
  createCapabilityGate,
  isActivityEvent,
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
  test("denies when a declared required capability has no grant", () => {
    const gate = createCapabilityGate({ manifest, grants: [] });

    expect(gate.assert("visual.hide")).toBe(false);
  });

  test("denies when an optional capability grant is off", () => {
    const gate = createCapabilityGate({
      manifest,
      grants: ["visual.hide"],
    });

    expect(gate.assert("reddit.comments.search")).toBe(false);
  });

  test("denies when the mod did not declare the capability", () => {
    const gate = createCapabilityGate({
      manifest,
      grants: ["network.browser.block"],
    });

    expect(gate.assert("network.browser.block")).toBe(false);
  });

  test("returns after a declared capability is granted", () => {
    const gate = createCapabilityGate({
      manifest,
      grants: ["visual.hide"],
    });

    expect(gate.assert("visual.hide")).toBe(true);
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

    expect(gate.assertEgressContract("comments")).toBe(true);
    expect(gate.assertEgressContract("undeclared")).toBe(false);
  });

  test("emits the layer, mod id, capability, and outcome for every decision", () => {
    const emit = vi.fn();
    const gate = createCapabilityGate({
      manifest,
      grants: ["visual.hide"],
      emit,
    });

    gate.assert("visual.hide");
    expect(gate.assert("reddit.comments.search")).toBe(false);
    expect(gate.assert("youtube.watch.constrainAutoplay")).toBe(false);

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
    expect(emit).toHaveBeenNthCalledWith(3, {
      layer: "capability-gate",
      modId: "example.mod",
      capability: "youtube.watch.constrainAutoplay",
      outcome: "denied",
    });
  });

  test("accepts only well-formed activity events", () => {
    expect(
      isActivityEvent({
        layer: "capability-gate",
        modId: "example.mod",
        capability: "visual.hide",
        outcome: "allowed",
      }),
    ).toBe(true);
    expect(
      isActivityEvent({
        layer: "other",
        modId: "example.mod",
        capability: "visual.hide",
        outcome: "allowed",
      }),
    ).toBe(false);
    expect(
      isActivityEvent({
        layer: "userscript-runtime",
        modId: "example.mod",
        outcome: "denied",
      }),
    ).toBe(true);
    expect(
      isActivityEvent({
        layer: "userscript-runtime",
        modId: "",
        outcome: "denied",
      }),
    ).toBe(false);
  });

  test("prepends activity events and drops the oldest past the limit", () => {
    const first = {
      layer: "capability-gate" as const,
      modId: "example.mod",
      capability: "visual.hide" as const,
      outcome: "allowed" as const,
      at: 1,
    };
    const overflow = Array.from({ length: ACTIVITY_EVENT_LIMIT }, (_, index) => ({
      ...first,
      at: index + 2,
    }));
    const stored = overflow.reduce(
      (current, event) => appendActivityEvents(current, event),
      appendActivityEvents([], first),
    );

    expect(stored).toHaveLength(ACTIVITY_EVENT_LIMIT);
    expect(stored[0]?.at).toBe(ACTIVITY_EVENT_LIMIT + 1);
    expect(stored.some((event) => event.at === 1)).toBe(false);
  });

  test("pause and unpause are not capability grants", () => {
    const paused = createCapabilityGate({
      manifest,
      grants: ["visual.hide"],
    });
    const resumed = createCapabilityGate({
      manifest,
      grants: ["visual.hide"],
    });

    expect(paused.assert("visual.hide")).toBe(true);
    expect(resumed.assert("visual.hide")).toBe(true);
    expect(paused.assert("reddit.comments.search")).toBe(false);
    expect(resumed.assert("reddit.comments.search")).toBe(false);
    expect(paused).not.toHaveProperty("eval");
    expect(paused).not.toHaveProperty("fetch");
    expect(paused).not.toHaveProperty("extract");
    expect(resumed).not.toHaveProperty("eval");
    expect(resumed).not.toHaveProperty("fetch");
    expect(resumed).not.toHaveProperty("extract");
  });
});
