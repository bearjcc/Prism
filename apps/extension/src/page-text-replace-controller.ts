import type { PageTextReplaceRules } from "@prism/schema";
import type { ActivityEvent } from "./gate.js";
import {
  createPageTextReplaceSession,
  type PageTextReplaceSession,
} from "./page-text-replace.js";

let cachedRules: PageTextReplaceRules = { pairs: [] };
let activeSession: PageTextReplaceSession | undefined;
let modActionEmitter: ((event: ActivityEvent) => void | Promise<void>) | undefined;

export function bindWordReplacerActivityEmit(
  emit: ((event: ActivityEvent) => void | Promise<void>) | undefined,
): void {
  modActionEmitter = emit;
}

export function setWordReplacerRules(rules: PageTextReplaceRules): void {
  cachedRules = rules;
  activeSession?.refresh(rules);
}

export function readCachedWordReplacerRules(): PageTextReplaceRules {
  return cachedRules;
}

export function stopWordReplacerSession(): void {
  activeSession?.stop();
  activeSession = undefined;
}

export function runWordReplacer(
  document: Document,
  rules: PageTextReplaceRules,
  _emit?: (event: ActivityEvent) => void | Promise<void>,
  modId?: string,
): () => void {
  stopWordReplacerSession();
  cachedRules = rules;
  activeSession = createPageTextReplaceSession({
    document,
    rules,
    onReplacementCount(count) {
      if (modId === undefined || count <= 0) {
        return;
      }
      void modActionEmitter?.({
        layer: "mod-action",
        modId,
        capability: "page.text.replace",
        count,
      });
    },
  });
  return () => {
    stopWordReplacerSession();
  };
}
