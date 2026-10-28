import type {
  PageTextReplaceRules,
  PageTextReplaceSegment,
  PageTextReplaceStyleId,
} from "@prism/schema";
import {
  PAGE_TEXT_REPLACE_STYLE_IDS,
  replacePageTextInString,
} from "@prism/schema/page-text-replace";

export const WORD_REPLACER_MOD_ID = "prism.word-replacer";
export const WORD_REPLACER_SETTINGS_STORAGE_KEY = "wordReplacerSettings";

export const PAGE_TEXT_REPLACE_OWNER = "word-replace";
export const PAGE_TEXT_REPLACE_PROCESSED_ATTR = "data-prism-text-replaced";

const SKIP_ANCESTOR_SELECTOR =
  "input,textarea,select,option,[contenteditable=''],[contenteditable='true'],script,style,noscript,template,code,pre,kbd,samp,svg";

const STYLE_CLASS: Record<PageTextReplaceStyleId, string> = {
  bold: "prism-wr-bold",
  italic: "prism-wr-italic",
  underline: "prism-wr-underline",
  strikethrough: "prism-wr-strike",
  allCaps: "prism-wr-all-caps",
  smallCaps: "prism-wr-small-caps",
  highlight: "prism-wr-highlight",
};

export interface PageTextReplaceSession {
  readonly stop: () => void;
  readonly refresh: (rules: PageTextReplaceRules) => void;
}

export interface PageTextReplaceOptions {
  readonly document: Document;
  readonly rules: PageTextReplaceRules;
  readonly onReplacementCount?: (count: number) => void;
}

export function createPageTextReplaceSession(
  options: PageTextReplaceOptions,
): PageTextReplaceSession {
  const { document } = options;
  let rules = options.rules;
  let disposed = false;
  let pending = false;
  const processedNodes = new WeakSet<Text>();
  const undoSteps: Array<() => void> = [];
  const styleElement = injectWordReplaceStyles(document);

  const schedule = (): void => {
    if (pending || disposed) {
      return;
    }
    pending = true;
    const view = document.defaultView;
    if (view === null) {
      pending = false;
      return;
    }
    view.requestAnimationFrame(() => {
      pending = false;
      if (disposed) {
        return;
      }
      runPass();
    });
  };

  const observer =
    document.defaultView?.MutationObserver === undefined
      ? undefined
      : new document.defaultView.MutationObserver(() => {
          schedule();
        });

  observer?.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  function revertAll(): void {
    while (undoSteps.length > 0) {
      const step = undoSteps.pop();
      try {
        step?.();
      } catch {
        // Undo is best-effort on live hosts.
      }
    }
  }

  function runPass(): void {
    const root = document.body ?? document.documentElement;
    if (root === null) {
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const targets: Text[] = [];
    let node = walker.nextNode();
    while (node !== null) {
      if (node instanceof Text && shouldProcessTextNode(node, processedNodes)) {
        targets.push(node);
      }
      node = walker.nextNode();
    }
    let passCount = 0;
    for (const textNode of targets) {
      passCount += replaceTextNode(textNode, rules, processedNodes, undoSteps);
    }
    if (passCount > 0) {
      options.onReplacementCount?.(passCount);
    }
  }

  runPass();

  return {
    refresh(nextRules) {
      rules = nextRules;
      revertAll();
      runPass();
    },
    stop() {
      disposed = true;
      observer?.disconnect();
      revertAll();
      styleElement.remove();
    },
  };
}

export function shouldProcessTextNode(
  node: Text,
  processedNodes: WeakSet<Text>,
): boolean {
  if (processedNodes.has(node)) {
    return false;
  }
  const value = node.nodeValue ?? "";
  if (value.trim() === "") {
    return false;
  }
  const parent = node.parentElement;
  if (parent === null) {
    return false;
  }
  if (parent.closest(`[${PAGE_TEXT_REPLACE_PROCESSED_ATTR}]`) !== null) {
    return false;
  }
  if (parent.closest(SKIP_ANCESTOR_SELECTOR) !== null) {
    return false;
  }
  return true;
}

function replaceTextNode(
  node: Text,
  rules: PageTextReplaceRules,
  processedNodes: WeakSet<Text>,
  undoSteps: Array<() => void>,
): number {
  const original = node.nodeValue ?? "";
  const result = replacePageTextInString(original, rules);
  if (result.replacementCount === 0) {
    processedNodes.add(node);
    return 0;
  }
  const parent = node.parentNode;
  if (parent === null) {
    return 0;
  }
  const replacement = buildReplacementNodes(node.ownerDocument, result.segments);
  const snapshot = node.cloneNode(true);
  parent.replaceChild(replacement, node);
  markProcessedSubtree(replacement, processedNodes);
  undoSteps.push(() => {
    if (!replacement.isConnected || parent !== replacement.parentNode) {
      return;
    }
    parent.replaceChild(snapshot, replacement);
  });
  return result.replacementCount;
}

function buildReplacementNodes(
  document: Document,
  segments: readonly PageTextReplaceSegment[],
): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.dataset.prismOwned = PAGE_TEXT_REPLACE_OWNER;
  wrapper.setAttribute(PAGE_TEXT_REPLACE_PROCESSED_ATTR, "1");
  for (const segment of segments) {
    if (segment.styles === undefined) {
      wrapper.append(document.createTextNode(segment.text));
      continue;
    }
    const span = document.createElement("span");
    for (const styleId of PAGE_TEXT_REPLACE_STYLE_IDS) {
      if (segment.styles[styleId] === true) {
        span.classList.add(STYLE_CLASS[styleId]);
      }
    }
    span.textContent = segment.text;
    wrapper.append(span);
  }
  return wrapper;
}

function markProcessedSubtree(root: Node, processedNodes: WeakSet<Text>): void {
  const walker = root.ownerDocument?.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  if (walker === undefined) {
    return;
  }
  let node = walker.nextNode();
  while (node !== null) {
    if (node instanceof Text) {
      processedNodes.add(node);
    }
    node = walker.nextNode();
  }
}

function injectWordReplaceStyles(document: Document): HTMLStyleElement {
  const style = document.createElement("style");
  style.dataset.prismOwned = PAGE_TEXT_REPLACE_OWNER;
  style.textContent = `[data-prism-owned="${PAGE_TEXT_REPLACE_OWNER}"] .${STYLE_CLASS.bold}{font-weight:700}[data-prism-owned="${PAGE_TEXT_REPLACE_OWNER}"] .${STYLE_CLASS.italic}{font-style:italic}[data-prism-owned="${PAGE_TEXT_REPLACE_OWNER}"] .${STYLE_CLASS.underline}{text-decoration:underline}[data-prism-owned="${PAGE_TEXT_REPLACE_OWNER}"] .${STYLE_CLASS.strikethrough}{text-decoration:line-through}[data-prism-owned="${PAGE_TEXT_REPLACE_OWNER}"] .${STYLE_CLASS.allCaps}{text-transform:uppercase}[data-prism-owned="${PAGE_TEXT_REPLACE_OWNER}"] .${STYLE_CLASS.smallCaps}{font-variant:small-caps}[data-prism-owned="${PAGE_TEXT_REPLACE_OWNER}"] .${STYLE_CLASS.highlight}{background:rgb(255,240,120)}`;
  const root = document.head ?? document.documentElement;
  root.append(style);
  return style;
}

export function readWordReplacerPreviewSample(settings: unknown): string {
  if (
    typeof settings === "object" &&
    settings !== null &&
    "previewSample" in settings &&
    typeof settings.previewSample === "string"
  ) {
    return settings.previewSample;
  }
  return "The scuba club met God in New York City.";
}
