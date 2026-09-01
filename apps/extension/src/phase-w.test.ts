import { describe, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  BEHAVIOUR_POLICY_IDS,
  type BehaviourPolicyResponse,
} from "./behaviour-policies.js";
import {
  BEHAVIOUR_POLICY_PANEL_LABELS,
  formatPageActivityRow,
  pageActivityRows,
  type PageActivityMod,
  type PageActivitySnapshot,
} from "./page-activity.js";
import { mountPopup } from "./popup.js";

const FIXTURE_ORIGIN = "https://meet.example";

const defaultPolicy = (
  overrides: Partial<BehaviourPolicyResponse> = {},
): BehaviourPolicyResponse => ({
  default: true,
  denyOrigins: [],
  allow: true,
  originDenied: false,
  ...overrides,
});

function allPolicies(
  override: Partial<Record<string, BehaviourPolicyResponse>> = {},
): PageActivitySnapshot["policies"] {
  const policies = {} as PageActivitySnapshot["policies"];
  for (const id of BEHAVIOUR_POLICY_IDS) {
    policies[id] = override[id] ?? defaultPolicy();
  }
  return policies;
}

function visualMod(
  overrides: Partial<PageActivityMod> = {},
): PageActivityMod {
  return {
    id: "fixture.hide",
    enabled: true,
    scopes: [`${FIXTURE_ORIGIN}/*`],
    required: ["visual.hide"],
    optional: [],
    grants: ["visual.hide"],
    ...overrides,
  };
}

describe("Phase W current-page activity panel", () => {
  test("lists an enabled in-scope visual mod on the fixture origin", () => {
    const rows = pageActivityRows(
      { mods: [visualMod()], policies: allPolicies() },
      FIXTURE_ORIGIN,
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          layer: "visual",
          source: "fixture.hide",
          rule: "required visual.hide is in effect.",
          attribution: "known",
        },
      ]),
    );
  });

  test("omits out-of-scope and globally disabled mods", () => {
    const rows = pageActivityRows(
      {
        mods: [
          visualMod({ scopes: ["https://other.example/*"] }),
          visualMod({ id: "fixture.off", enabled: false }),
        ],
        policies: {},
      },
      FIXTURE_ORIGIN,
    );
    expect(rows.filter((row) => row.source.startsWith("fixture."))).toEqual([]);
  });

  test("lists granted optional capabilities and skips ungranted ones", () => {
    const rows = pageActivityRows(
      {
        mods: [
          visualMod({
            id: "fixture.kitten",
            scopes: ["<all_urls>"],
            required: ["visual.ad-slot.replace"],
            optional: ["network.egress", "network.browser.block"],
            grants: ["visual.ad-slot.replace", "network.egress"],
          }),
        ],
        policies: {},
      },
      FIXTURE_ORIGIN,
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          layer: "network",
          source: "fixture.kitten",
          rule: "optional grant network.egress is in effect.",
          attribution: "known",
        },
      ]),
    );
    expect(rows.some((row) => row.rule.includes("network.browser.block"))).toBe(
      false,
    );
  });

  test("lists DNR as applying when browser block is granted", () => {
    const rows = pageActivityRows(
      {
        mods: [
          visualMod({
            id: "fixture.kitten",
            scopes: ["<all_urls>"],
            required: ["visual.ad-slot.replace"],
            optional: ["network.browser.block"],
            grants: ["visual.ad-slot.replace", "network.browser.block"],
          }),
        ],
        policies: {},
      },
      FIXTURE_ORIGIN,
    );
    expect(rows).toContainEqual({
      layer: "network",
      source: "fixture.kitten",
      rule: "DNR block lists apply for requests initiated by this origin.",
      attribution: "known",
    });
  });

  test("lists site exceptions for content skip and DNR initiator exclude", () => {
    const rows = pageActivityRows(
      {
        mods: [
          visualMod({
            id: "fixture.kitten",
            scopes: ["<all_urls>"],
            required: ["visual.ad-slot.replace"],
            optional: ["network.browser.block"],
            grants: ["visual.ad-slot.replace", "network.browser.block"],
            disabledOnOrigin: true,
          }),
        ],
        policies: {},
      },
      FIXTURE_ORIGIN,
    );
    expect(rows).toEqual([
      {
        layer: "visual",
        source: "fixture.kitten",
        rule: "Site exception: content mods skip this origin.",
        attribution: "known",
      },
      {
        layer: "network",
        source: "fixture.kitten",
        rule: "Site exception: DNR excludes this origin as initiator.",
        attribution: "known",
      },
    ]);
  });

  test("lists paused mods without treating them as active", () => {
    const rows = pageActivityRows(
      {
        mods: [
          visualMod({
            pausedOnOrigin: true,
            optional: ["network.browser.block"],
            grants: ["visual.hide", "network.browser.block"],
          }),
        ],
        policies: {},
      },
      FIXTURE_ORIGIN,
    );
    expect(rows).toEqual([
      {
        layer: "visual",
        source: "fixture.hide",
        rule: "Paused after repeated failures: content mods skip this origin.",
        attribution: "known",
      },
      {
        layer: "network",
        source: "fixture.hide",
        rule: "Paused: DNR excludes this origin as initiator.",
        attribution: "known",
      },
    ]);
    expect(rows.some((row) => row.rule.includes("is in effect"))).toBe(false);
  });

  test("lists behaviour policies including denyOrigins overrides", () => {
    const rows = pageActivityRows(
      {
        mods: [],
        policies: allPolicies({
          paste: defaultPolicy({
            originDenied: true,
            allow: false,
            denyOrigins: [FIXTURE_ORIGIN],
          }),
          autoplay: defaultPolicy({ default: false, allow: false }),
        }),
      },
      FIXTURE_ORIGIN,
    );
    expect(rows).toContainEqual({
      layer: "behavioural",
      source: BEHAVIOUR_POLICY_PANEL_LABELS.paste,
      rule: "Origin is in denyOrigins; policy is not applied.",
      attribution: "known",
    });
    expect(rows).toContainEqual({
      layer: "behavioural",
      source: BEHAVIOUR_POLICY_PANEL_LABELS.autoplay,
      rule: "Globally off.",
      attribution: "known",
    });
    expect(rows).toContainEqual({
      layer: "behavioural",
      source: BEHAVIOUR_POLICY_PANEL_LABELS["title-freeze"],
      rule: "Active on this origin.",
      attribution: "known",
    });
  });

  test("marks activity events as uncertain rather than guessing the tab", () => {
    const rows = pageActivityRows(
      {
        mods: [],
        policies: {},
        activity: [
          {
            layer: "capability-gate",
            modId: "fixture.hide",
            capability: "visual.hide",
            outcome: "allowed",
            at: 1,
          },
        ],
      },
      FIXTURE_ORIGIN,
    );
    expect(rows).toEqual([
      {
        layer: "uncertain",
        source: "fixture.hide",
        rule: "Capability decision (visual.hide allowed) is not bound to this tab origin.",
        attribution: "uncertain",
      },
    ]);
    expect(formatPageActivityRow(rows[0]!)).toContain(
      "Attribution is uncertain.",
    );
  });

  test("marks unknown capability families as uncertain", () => {
    const rows = pageActivityRows(
      {
        mods: [
          visualMod({
            required: ["reddit.comments.search"],
            grants: ["reddit.comments.search"],
          }),
        ],
        policies: {},
      },
      FIXTURE_ORIGIN,
    );
    expect(rows).toEqual([
      {
        layer: "uncertain",
        source: "fixture.hide",
        rule: "required reddit.comments.search is in effect.",
        attribution: "uncertain",
      },
    ]);
  });

  test("does not guess a page origin for chrome tabs", () => {
    const rows = pageActivityRows(
      { mods: [visualMod()], policies: allPolicies() },
      undefined,
    );
    expect(rows).toEqual([
      {
        layer: "uncertain",
        source: "tab",
        rule: "This tab has no http(s) origin.",
        attribution: "uncertain",
      },
    ]);
  });

  test("popup renders current-page rows for the active tab origin", async () => {
    const sendMessage = vi.fn(async (message: { readonly type?: string }) => {
      if (message.type === "list-activity") {
        return [];
      }
      if (
        message.type === "get-behaviour-policies" ||
        message.type === "get-paste-policy"
      ) {
        return allPolicies();
      }
      return [
        {
          manifest: {
            id: "fixture.hide",
            version: "1.0.0",
            runtime: "native",
            capabilities: { required: ["visual.hide"] },
            scopes: [`${FIXTURE_ORIGIN}/*`],
          },
          enabled: true,
          grants: ["visual.hide"],
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
            { id: 8, url: `${FIXTURE_ORIGIN}/call` },
          ]),
        },
      },
      dom.window.document,
    );
    expect(dom.window.document.getElementById("page-origin")?.textContent).toBe(
      `This site: ${FIXTURE_ORIGIN}`,
    );
    expect(dom.window.document.getElementById("page-activity")?.textContent).toContain(
      "visual: fixture.hide -- required visual.hide is in effect.",
    );
    expect(dom.window.document.getElementById("page-activity")?.textContent).toContain(
      "behavioural: Allow paste -- Active on this origin.",
    );
  });
});
