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
