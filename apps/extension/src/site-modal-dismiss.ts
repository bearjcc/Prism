import type { CapabilityId } from "@prism/schema";
import type { ActivityEvent } from "./gate.js";
import { unlockRoot } from "./scroll-lock.js";

export const MODAL_DISMISS_SUPPRESSED_MARK = "data-prism-modal-dismiss-suppressed";

export type ModActionOutcome = "applied" | "skipped" | "refused";

export interface ModActionEmitter {
  (
    action: string,
    outcome: ModActionOutcome,
  ): void;
}

export function createModActionEmitter(
  modId: string,
  capability: CapabilityId,
  emit?: (event: Extract<ActivityEvent, { layer: "mod-action" }>) => void,
): ModActionEmitter {
  return (action, outcome) => {
    emit?.({
      layer: "mod-action",
      modId,
      capability,
      action,
      outcome,
    });
  };
}

export interface ModalDismissGuardOptions {
  readonly contentDocument: Document;
  readonly runPass: () => void;
}

export interface ModalDismissGuardHandle {
  disconnect(): void;
}

export function installModalDismissGuard(
  options: ModalDismissGuardOptions,
): ModalDismissGuardHandle & (() => void) {
  const view = options.contentDocument.defaultView;
  const MutationObserverCtor = view?.MutationObserver;
  let observer: MutationObserver | undefined;
  let disconnected = false;

  const run = (): void => {
    if (!disconnected) {
      options.runPass();
    }
  };

  if (MutationObserverCtor !== undefined) {
    observer = new MutationObserverCtor(() => {
      run();
    });
    observer.observe(options.contentDocument.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden", "aria-hidden"],
    });
  }

  run();

  const undo = (): void => {
    disconnected = true;
    observer?.disconnect();
  };

  return Object.assign(undo, {
    disconnect() {
      undo();
    },
  });
}

export function hideElementWithUndo(
  element: HTMLElement,
  emit: ModActionEmitter,
  action: string,
): (() => void) | undefined {
  if (element.hasAttribute(MODAL_DISMISS_SUPPRESSED_MARK)) {
    return undefined;
  }
  const previousDisplay = element.style.getPropertyValue("display");
  const previousPriority = element.style.getPropertyPriority("display");
  element.setAttribute(MODAL_DISMISS_SUPPRESSED_MARK, "");
  element.style.setProperty("display", "none", "important");
  emit(action, "applied");
  return () => {
    element.removeAttribute(MODAL_DISMISS_SUPPRESSED_MARK);
    if (previousDisplay === "") {
      element.style.removeProperty("display");
    } else {
      element.style.setProperty(
        "display",
        previousDisplay,
        previousPriority || undefined,
      );
    }
  };
}

export function hideFirstMatchingSelector(
  contentDocument: Document,
  selector: string,
  emit: ModActionEmitter,
  action: string,
): (() => void) | undefined {
  const view = contentDocument.defaultView;
  if (view === null) {
    return undefined;
  }
  for (const node of Array.from(contentDocument.querySelectorAll(selector))) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    return hideElementWithUndo(node, emit, action);
  }
  return undefined;
}

export function clickFirstMatchingSelector(
  contentDocument: Document,
  selector: string,
  emit: ModActionEmitter,
  action: string,
  refuse?: (element: HTMLElement) => boolean,
): boolean {
  const view = contentDocument.defaultView;
  if (view === null) {
    return false;
  }
  for (const node of Array.from(contentDocument.querySelectorAll(selector))) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    if (!isVisibleModalControl(node, view)) {
      continue;
    }
    if (refuse?.(node) === true) {
      emit(action, "refused");
      continue;
    }
    node.click();
    emit(action, "applied");
    return true;
  }
  return false;
}

export function isVisibleModalControl(element: HTMLElement, view: Window): boolean {
  if (!element.isConnected) {
    return false;
  }
  if (element.closest(`[${MODAL_DISMISS_SUPPRESSED_MARK}]`) !== null) {
    return false;
  }
  const style = view.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function readableModalText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/gu, " ").trim();
}

export function releaseDocumentScroll(contentDocument: Document): void {
  unlockRoot(contentDocument.documentElement);
  if (contentDocument.body !== null) {
    unlockRoot(contentDocument.body);
  }
}

export function isFixedOverlay(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  if (view === null) {
    return false;
  }
  const style = view.getComputedStyle(element);
  if (style.position !== "fixed" && style.position !== "sticky") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width >= view.innerWidth * 0.5 && rect.height >= view.innerHeight * 0.25;
}

export function pushUndo(
  undoStack: Array<() => void>,
  step: (() => void) | undefined,
): void {
  if (step !== undefined) {
    undoStack.push(step);
  }
}

export function drainUndoStack(undoStack: Array<() => void>): void {
  while (undoStack.length > 0) {
    const step = undoStack.pop();
    try {
      step?.();
    } catch {
      // Undo is best-effort on live hosts.
    }
  }
}
