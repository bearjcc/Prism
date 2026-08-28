import type { BundledMod } from "./loader.js";

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
    },
  }));
}

export async function syncBrowserBlockRules(
  mods: readonly BundledMod[],
  enabled: Readonly<Record<string, boolean>>,
  grants: Readonly<Record<string, readonly string[]>>,
  readFilter: ReadBrowserFilter,
  dynamicRules: DynamicRulesApi,
): Promise<void> {
  const filterLists: string[] = [];

  for (const { manifest } of mods) {
    if (
      enabled[manifest.id] === false ||
      !grants[manifest.id]?.includes("network.browser.block")
    ) {
      continue;
    }
    for (const path of manifest.filters?.browser ?? []) {
      filterLists.push(await readFilter(manifest.id, path));
    }
  }

  const addRules = compileBrowserFilters(
    filterLists,
    PRISM_DYNAMIC_RULE_START,
  );
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
