import type { PageTextReplaceRules } from "@prism/schema";
import {
  normalizePageTextReplaceRules,
  replacePageTextInString,
  type PageTextReplacePair,
  type PageTextReplaceStyleId,
} from "@prism/schema/page-text-replace";
import {
  PAGE_TEXT_REPLACE_OWNER,
  readWordReplacerPreviewSample,
  WORD_REPLACER_MOD_ID,
  WORD_REPLACER_SETTINGS_STORAGE_KEY,
} from "./page-text-replace.js";

export interface WordReplacerStoredSettings {
  readonly pairs: readonly PageTextReplacePair[];
  readonly previewSample?: string;
}

export function defaultWordReplacerSettings(): WordReplacerStoredSettings {
  return {
    previewSample: readWordReplacerPreviewSample(undefined),
    pairs: [
      {
        id: "demo-scuba",
        find: "scuba",
        replace: "SCUBA",
        enabled: true,
        wholeWord: true,
        caseSensitive: false,
        caseMode: "literal",
        styles: {},
      },
      {
        id: "demo-god",
        find: "God",
        replace: "Magical Sky Daddy",
        enabled: false,
        wholeWord: true,
        caseSensitive: false,
        caseMode: "literal",
        styles: { italic: true },
      },
    ],
  };
}

export function readWordReplacerSettings(value: unknown): WordReplacerStoredSettings {
  if (typeof value !== "object" || value === null) {
    return defaultWordReplacerSettings();
  }
  const record = value as Record<string, unknown>;
  const normalized = normalizePageTextReplaceRules({ pairs: record.pairs });
  const previewSample =
    typeof record.previewSample === "string"
      ? record.previewSample
      : readWordReplacerPreviewSample(undefined);
  if (normalized.pairs.length === 0) {
    return defaultWordReplacerSettings();
  }
  return { pairs: normalized.pairs, previewSample };
}

export function toPageTextReplaceRules(
  settings: WordReplacerStoredSettings,
): PageTextReplaceRules {
  return { pairs: settings.pairs };
}

export function exportWordReplacerJson(settings: WordReplacerStoredSettings): string {
  return JSON.stringify(
    {
      modId: WORD_REPLACER_MOD_ID,
      pairs: settings.pairs,
      previewSample: settings.previewSample,
    },
    null,
    2,
  );
}

export function importWordReplacerJson(source: string): WordReplacerStoredSettings {
  const parsed = JSON.parse(source) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Import JSON must be an object");
  }
  const record = parsed as Record<string, unknown>;
  const normalized = normalizePageTextReplaceRules({ pairs: record.pairs });
  if (normalized.pairs.length === 0) {
    throw new Error("Import must include at least one valid pair");
  }
  return {
    pairs: normalized.pairs,
    previewSample:
      typeof record.previewSample === "string"
        ? record.previewSample
        : readWordReplacerPreviewSample(undefined),
  };
}

export function renderWordReplacerPreviewHtml(
  document: Document,
  sample: string,
  rules: PageTextReplaceRules,
): HTMLElement {
  const result = replacePageTextInString(sample, rules);
  const container = document.createElement("p");
  container.className = "word-replacer-preview";
  container.dataset.prismOwned = PAGE_TEXT_REPLACE_OWNER;
  for (const segment of result.segments) {
    if (segment.styles === undefined) {
      container.append(document.createTextNode(segment.text));
      continue;
    }
    const span = document.createElement("span");
    for (const styleId of STYLE_ORDER) {
      if (segment.styles[styleId] === true) {
        span.classList.add(previewClass(styleId));
      }
    }
    span.textContent = segment.text;
    container.append(span);
  }
  return container;
}

const STYLE_ORDER: readonly PageTextReplaceStyleId[] = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "allCaps",
  "smallCaps",
  "highlight",
];

function previewClass(styleId: PageTextReplaceStyleId): string {
  return `word-replacer-preview-${styleId}`;
}

export { WORD_REPLACER_MOD_ID, WORD_REPLACER_SETTINGS_STORAGE_KEY };
