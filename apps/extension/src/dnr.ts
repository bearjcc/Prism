import type { BundledMod } from "./loader.js";
import { inspectBrowserFilterText } from "@prism/schema/inspect-package";

export interface DnrRule {
  readonly id: number;
  readonly priority: 1;
  readonly action: {
    readonly type: "block";
  };
  readonly condition: {
    readonly urlFilter: string;
    readonly domainType: "thirdParty";
    readonly resourceTypes: readonly string[];
    readonly excludedInitiatorDomains?: readonly string[];
  };
}

const BLOCKED_RESOURCE_TYPES = [
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
] as const;

const HOST_FILTER = /^\|\|[a-z0-9.-]+\^$/iu;

export interface CosmeticHideInstruction {
  readonly selector: string;
  readonly domains?: readonly string[];
}

export const PRISM_DYNAMIC_RULE_START = 1_000_000;
const PRISM_DYNAMIC_RULE_END = 1_999_999;

export interface DynamicRulesApi {
  getDynamicRules(): Promise<ReadonlyArray<{ readonly id: number }>>;
  updateDynamicRules(update: {
    readonly removeRuleIds: readonly number[];
    readonly addRules: readonly DnrRule[];
  }): Promise<void>;
}

export type ReadBrowserFilter = (
  modId: string,
  path: string,
) => Promise<string>;

export function compileBrowserFilters(
  filterLists: readonly string[],
  firstRuleId = 1,
  excludedInitiatorDomains: readonly string[] = [],
): DnrRule[] {
  const filters = new Set<string>();

  for (const source of filterLists) {
    for (const sourceLine of source.split(/\r?\n/u)) {
      const filter = sourceLine.trim();
      if (HOST_FILTER.test(filter)) {
        filters.add(filter);
      }
    }
  }

  return [...filters].map((urlFilter, index) => ({
    id: firstRuleId + index,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter,
      domainType: "thirdParty",
      resourceTypes: BLOCKED_RESOURCE_TYPES,
      ...(excludedInitiatorDomains.length === 0
        ? {}
        : { excludedInitiatorDomains: [...excludedInitiatorDomains] }),
    },
  }));
}

export function initiatorHostFromOrigin(origin: string): string | undefined {
  try {
    const host = new URL(origin).hostname;
    return host === "" ? undefined : host;
  } catch {
    return undefined;
  }
}

export function cosmeticMatchesHost(
  instruction: CosmeticHideInstruction,
  hostname: string,
): boolean {
  if (instruction.domains === undefined || instruction.domains.length === 0) {
    return true;
  }
  const host = hostname.toLowerCase();
  return instruction.domains.some((domain) => {
    const normalised = domain.replace(/^\./u, "").toLowerCase();
    return host === normalised || host.endsWith(`.${normalised}`);
  });
}

export function cosmeticHideCss(
  instructions: readonly CosmeticHideInstruction[],
  hostname: string,
): string {
  const selectors = instructions
    .filter((instruction) => cosmeticMatchesHost(instruction, hostname))
    .map((instruction) => instruction.selector.trim())
    .filter((selector) => isSafeCosmeticSelector(selector));
  if (selectors.length === 0) {
    return "";
  }
  return `${selectors.join(",\n")} { display: none !important; }`;
}

function isSafeCosmeticSelector(selector: string): boolean {
  return (
    selector !== "" &&
    !selector.includes("{") &&
    !selector.includes("}") &&
    !/@|url\s*\(/iu.test(selector)
  );
}

export function compileCosmeticFilters(
  filterLists: readonly string[],
): CosmeticHideInstruction[] {
  const hides: CosmeticHideInstruction[] = [];
  const seen = new Set<string>();

  for (const source of filterLists) {
    for (const sourceLine of source.split(/\r?\n/u)) {
      const filter = sourceLine.trim();
      if (filter === "" || filter.startsWith("!")) {
        continue;
      }
      const exceptionAt = filter.indexOf("#@#");
      const hideAt = filter.indexOf("##");
      if (hideAt < 0 || (exceptionAt >= 0 && exceptionAt <= hideAt)) {
        continue;
      }
      const domainPart = filter.slice(0, hideAt).trim();
      const selector = filter.slice(hideAt + 2).trim();
      if (selector === "") {
        continue;
      }
      const domains = domainPart === "" ? undefined : domainPart.split(",");
      const key = `${domainPart}##${selector}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hides.push(
        domains === undefined ? { selector } : { selector, domains },
      );
    }
  }

  return hides;
}

export async function syncBrowserBlockRules(
  mods: readonly BundledMod[],
  enabled: Readonly<Record<string, boolean>>,
  grants: Readonly<Record<string, readonly string[]>>,
  readFilter: ReadBrowserFilter,
  dynamicRules: DynamicRulesApi,
  siteExceptions: Readonly<Record<string, readonly string[]>> = {},
): Promise<void> {
  const addRules: DnrRule[] = [];
  let nextId = PRISM_DYNAMIC_RULE_START;

  for (const { manifest } of mods) {
    if (
      enabled[manifest.id] === false ||
      !grants[manifest.id]?.includes("network.browser.block")
    ) {
      continue;
    }
    const filterLists: string[] = [];
    for (const path of manifest.filters?.browser ?? []) {
      if (!path.startsWith("filters/browser/")) {
        continue;
      }
      const source = await readFilter(manifest.id, path);
      if (inspectBrowserFilterText(path, source).length === 0) {
        filterLists.push(source);
      }
    }
    const excludedInitiatorDomains = [
      ...new Set(
        (siteExceptions[manifest.id] ?? [])
          .map(initiatorHostFromOrigin)
          .filter((host): host is string => host !== undefined),
      ),
    ];
    const compiled = compileBrowserFilters(
      filterLists,
      nextId,
      excludedInitiatorDomains,
    );
    addRules.push(...compiled);
    nextId += compiled.length;
  }
  if (
    addRules.at(-1)?.id !== undefined &&
    addRules.at(-1)!.id > PRISM_DYNAMIC_RULE_END
  ) {
    throw new Error("Prism browser filter rule range is exhausted");
  }

  const currentRules = await dynamicRules.getDynamicRules();
  const removeRuleIds = currentRules
    .map(({ id }) => id)
    .filter(
      (id) =>
        id >= PRISM_DYNAMIC_RULE_START && id <= PRISM_DYNAMIC_RULE_END,
    );
  await dynamicRules.updateDynamicRules({ removeRuleIds, addRules });
}
