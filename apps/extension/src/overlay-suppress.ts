export const OVERLAY_SUPPRESS_SELECTORS = [
  "[data-prism-modal]",
  "[data-prism-chatbot]",
] as const;

const HIDDEN_MARK = "data-prism-overlay-suppressed";

export interface OverlaySuppressGuard {
  setActive(active: boolean): void;
  disconnect(): void;
}

export function installOverlaySuppressGuard(
  contentDocument: Document,
  active: boolean = true,
): OverlaySuppressGuard {
  let enabled = active;
  const view = contentDocument.defaultView;
  const MutationObserverCtor = view?.MutationObserver;
  let observer: MutationObserver | undefined;

  const apply = (): void => {
    if (enabled) {
      hideOverlays(contentDocument);
      return;
    }
    restoreOverlays(contentDocument);
  };

  if (MutationObserverCtor !== undefined) {
    observer = new MutationObserverCtor(() => {
      apply();
    });
    observer.observe(contentDocument.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-prism-modal", "data-prism-chatbot", "style", "class"],
    });
  }

  apply();

  return {
    setActive(next) {
      enabled = next;
      apply();
    },
    disconnect() {
      observer?.disconnect();
    },
  };
}

function hideOverlays(contentDocument: Document): void {
  for (const element of labelledOverlays(contentDocument)) {
    if (element.hasAttribute(HIDDEN_MARK)) {
      continue;
    }
    element.setAttribute(HIDDEN_MARK, "");
    element.style.setProperty("display", "none", "important");
  }
}

function restoreOverlays(contentDocument: Document): void {
  const view = contentDocument.defaultView;
  if (view === null) {
    return;
  }
  for (const element of Array.from(
    contentDocument.querySelectorAll(`[${HIDDEN_MARK}]`),
  )) {
    if (!(element instanceof view.HTMLElement)) {
      continue;
    }
    element.removeAttribute(HIDDEN_MARK);
    element.style.removeProperty("display");
  }
}

function labelledOverlays(contentDocument: Document): HTMLElement[] {
  const view = contentDocument.defaultView;
  if (view === null) {
    return [];
  }
  const found: HTMLElement[] = [];
  const selector = OVERLAY_SUPPRESS_SELECTORS.join(",");
  for (const node of Array.from(contentDocument.querySelectorAll(selector))) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    found.push(node);
  }
  return found;
}
