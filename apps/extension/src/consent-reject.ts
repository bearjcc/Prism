import { performSameOriginUserAction } from "./same-origin-action.js";

export const CONSENT_ROOT_SELECTOR = "[data-prism-consent]";

const HIDDEN_MARK = "data-prism-consent-suppressed";

export interface ConsentRejectGuard {
  setActive(active: boolean): void;
  disconnect(): void;
}

export function installConsentRejectGuard(
  contentDocument: Document,
  active: boolean = true,
): ConsentRejectGuard {
  let enabled = active;
  const view = contentDocument.defaultView;
  const MutationObserverCtor = view?.MutationObserver;
  let observer: MutationObserver | undefined;

  const apply = (): void => {
    if (!enabled) {
      return;
    }
    performSameOriginUserAction(contentDocument, "consent.reject");
    performSameOriginUserAction(contentDocument, "consent.dismiss");
    hideRemainingConsent(contentDocument);
  };

  if (MutationObserverCtor !== undefined) {
    observer = new MutationObserverCtor(() => {
      apply();
    });
    observer.observe(contentDocument.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-prism-consent",
        "data-prism-consent-reject",
        "data-prism-consent-dismiss",
      ],
    });
  }

  apply();

  return {
    setActive(next) {
      enabled = next;
      if (enabled) {
        apply();
      }
    },
    disconnect() {
      observer?.disconnect();
    },
  };
}

function hideRemainingConsent(contentDocument: Document): void {
  const view = contentDocument.defaultView;
  if (view === null) {
    return;
  }
  for (const node of Array.from(
    contentDocument.querySelectorAll(CONSENT_ROOT_SELECTOR),
  )) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    if (node.hasAttribute(HIDDEN_MARK)) {
      continue;
    }
    node.setAttribute(HIDDEN_MARK, "");
    node.style.setProperty("display", "none", "important");
  }
}
