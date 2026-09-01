import {
  BEHAVIOUR_POLICY_IDS,
  type BehaviourPolicyId,
  type BehaviourPolicyResponse,
} from "./behaviour-policies.js";
import type { StoredActivityEvent } from "./gate.js";
import { matchesAnyScope } from "./loader.js";

export const PAGE_ACTIVITY_UNCERTAIN = "uncertain" as const;

export type PageActivityLayer =
  | "visual"
  | "behavioural"
  | "network"
  | typeof PAGE_ACTIVITY_UNCERTAIN;

export type PageActivityAttribution = "known" | typeof PAGE_ACTIVITY_UNCERTAIN;

export interface PageActivityMod {
  readonly id: string;
  readonly enabled: boolean;
  readonly scopes: readonly string[];
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly grants: readonly string[];
  readonly disabledOnOrigin?: boolean;
  readonly pausedOnOrigin?: boolean;
  readonly sessionExceptedOnOrigin?: boolean;
}

export interface PageActivitySnapshot {
  readonly mods: readonly PageActivityMod[];
  readonly policies: Partial<
    Record<BehaviourPolicyId, BehaviourPolicyResponse>
  >;
  readonly activity?: readonly StoredActivityEvent[];
}

export interface PageActivityRow {
  readonly layer: PageActivityLayer;
  readonly source: string;
  readonly rule: string;
  readonly attribution: PageActivityAttribution;
}

export const BEHAVIOUR_POLICY_PANEL_LABELS: Record<BehaviourPolicyId, string> = {
  paste: "Allow paste",
  "popup-suppress": "Suppress unsolicited popups",
  "title-freeze": "Keep page title stable",
  "scroll-lock": "Release scroll lock",
  "overlay-suppress": "Hide labelled modals and chatbots",
  "consent-reject": "Reject labelled consent panels",
  autoplay: "Constrain autoplay",
};

const ATTRIBUTION_UNCERTAIN_NOTE = "Attribution is uncertain.";

export function pageActivityRows(
  snapshot: PageActivitySnapshot,
  origin: string | undefined,
): PageActivityRow[] {
  if (origin === undefined || !isHttpOrigin(origin)) {
    return [
      {
        layer: PAGE_ACTIVITY_UNCERTAIN,
        source: "tab",
        rule: "This tab has no http(s) origin.",
        attribution: PAGE_ACTIVITY_UNCERTAIN,
      },
    ];
  }

  const pageUrl = `${origin}/`;
  const rows: PageActivityRow[] = [];

  for (const mod of snapshot.mods) {
    if (mod.enabled === false || !matchesAnyScope(mod.scopes, pageUrl)) {
      continue;
    }
    rows.push(...rowsForModOnOrigin(mod));
  }

  for (const id of BEHAVIOUR_POLICY_IDS) {
    const policy = snapshot.policies[id];
    if (policy === undefined) {
      continue;
    }
    rows.push(rowForBehaviourPolicy(id, policy));
  }

  for (const event of snapshot.activity ?? []) {
    rows.push(rowForUnattributedActivity(event));
  }

  return rows;
}

export function formatPageActivityRow(row: PageActivityRow): string {
  const body = `${row.layer}: ${row.source} -- ${row.rule}`;
  if (row.attribution === PAGE_ACTIVITY_UNCERTAIN) {
    return `${body} ${ATTRIBUTION_UNCERTAIN_NOTE}`;
  }
  return body;
}

function rowsForModOnOrigin(mod: PageActivityMod): PageActivityRow[] {
  const rows: PageActivityRow[] = [];
  const hasBlock = mod.grants.includes("network.browser.block");

  if (mod.disabledOnOrigin === true) {
    rows.push({
      layer: "visual",
      source: mod.id,
      rule: "Site exception: content mods skip this origin.",
      attribution: "known",
    });
    if (hasBlock) {
      rows.push({
        layer: "network",
        source: mod.id,
        rule: "Site exception: DNR excludes this origin as initiator.",
        attribution: "known",
      });
    }
  }

  if (mod.sessionExceptedOnOrigin === true) {
    rows.push({
      layer: "visual",
      source: mod.id,
      rule: "Session exception: content mods skip this origin until the worker restarts.",
      attribution: "known",
    });
    if (hasBlock) {
      rows.push({
        layer: "network",
        source: mod.id,
        rule: "Session exception: DNR excludes this origin as initiator until the worker restarts.",
        attribution: "known",
      });
    }
  }

  if (mod.pausedOnOrigin === true) {
    rows.push({
      layer: "visual",
      source: mod.id,
      rule: "Paused after repeated failures: content mods skip this origin.",
      attribution: "known",
    });
    if (hasBlock) {
      rows.push({
        layer: "network",
        source: mod.id,
        rule: "Paused: DNR excludes this origin as initiator.",
        attribution: "known",
      });
    }
  }

  if (
    mod.disabledOnOrigin === true ||
    mod.sessionExceptedOnOrigin === true ||
    mod.pausedOnOrigin === true
  ) {
    return rows;
  }

  const grantedOptional = new Set(
    mod.optional.filter((capability) => mod.grants.includes(capability)),
  );

  if (hasBlock) {
    rows.push({
      layer: "network",
      source: mod.id,
      rule: "DNR block lists apply for requests initiated by this origin.",
      attribution: "known",
    });
  }

  for (const capability of mod.required) {
    if (capability === "network.browser.block") {
      continue;
    }
    rows.push(rowForCapability(mod.id, capability, "required"));
  }

  for (const capability of mod.optional) {
    if (!grantedOptional.has(capability)) {
      continue;
    }
    if (capability === "network.browser.block") {
      continue;
    }
    rows.push(rowForCapability(mod.id, capability, "optional grant"));
  }

  if (rows.length === 0) {
    rows.push({
      layer: PAGE_ACTIVITY_UNCERTAIN,
      source: mod.id,
      rule: "Enabled on this origin; no visual or network capability to list.",
      attribution: PAGE_ACTIVITY_UNCERTAIN,
    });
  }

  return rows;
}

function rowForCapability(
  modId: string,
  capability: string,
  kind: "required" | "optional grant",
): PageActivityRow {
  const layer = layerForCapability(capability);
  return {
    layer,
    source: modId,
    rule: `${kind} ${capability} is in effect.`,
    attribution:
      layer === PAGE_ACTIVITY_UNCERTAIN ? PAGE_ACTIVITY_UNCERTAIN : "known",
  };
}

function rowForBehaviourPolicy(
  id: BehaviourPolicyId,
  policy: BehaviourPolicyResponse,
): PageActivityRow {
  let rule: string;
  if (policy.default === false) {
    rule = "Globally off.";
  } else if (policy.originDenied === true) {
    rule = "Origin is in denyOrigins; policy is not applied.";
  } else if (policy.sessionDeniedOnOrigin === true) {
    rule = "Session exception: policy is not applied until the worker restarts.";
  } else {
    rule = "Active on this origin.";
  }
  return {
    layer: "behavioural",
    source: BEHAVIOUR_POLICY_PANEL_LABELS[id],
    rule,
    attribution: "known",
  };
}

function rowForUnattributedActivity(event: StoredActivityEvent): PageActivityRow {
  const detail =
    event.layer === "userscript-runtime"
      ? `userscript ${event.outcome}`
      : `${event.capability} ${event.outcome}`;
  return {
    layer: PAGE_ACTIVITY_UNCERTAIN,
    source: event.modId,
    rule: `Capability decision (${detail}) is not bound to this tab origin.`,
    attribution: PAGE_ACTIVITY_UNCERTAIN,
  };
}

export function layerForCapability(capability: string): PageActivityLayer {
  if (capability.startsWith("visual.")) {
    return "visual";
  }
  if (capability.startsWith("network.")) {
    return "network";
  }
  return PAGE_ACTIVITY_UNCERTAIN;
}

function isHttpOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return (
      parsed.origin === origin &&
      (parsed.protocol === "http:" || parsed.protocol === "https:")
    );
  } catch {
    return false;
  }
}
