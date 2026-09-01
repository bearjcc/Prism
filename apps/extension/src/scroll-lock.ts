export interface ScrollLockGuard {
  setActive(active: boolean): void;
  disconnect(): void;
}

const LOCKED_OVERFLOW = new Set(["hidden", "clip"]);

export function installScrollLockGuard(
  contentDocument: Document,
  active: boolean = true,
): ScrollLockGuard {
  let enabled = active;
  const view = contentDocument.defaultView;
  const MutationObserverCtor = view?.MutationObserver;
  let observer: MutationObserver | undefined;

  const release = (): void => {
    if (!enabled) {
      return;
    }
    unlockRoot(contentDocument.documentElement);
    if (contentDocument.body !== null) {
      unlockRoot(contentDocument.body);
    }
    for (const element of overlayTraps(contentDocument)) {
      unlockOverflow(element);
    }
  };

  if (MutationObserverCtor !== undefined) {
    observer = new MutationObserverCtor(() => {
      release();
    });
    observer.observe(contentDocument.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }

  release();

  return {
    setActive(next) {
      enabled = next;
      if (enabled) {
        release();
      }
    },
    disconnect() {
      observer?.disconnect();
    },
  };
}

function overlayTraps(contentDocument: Document): HTMLElement[] {
  const view = contentDocument.defaultView;
  if (view === null) {
    return [];
  }
  const found: HTMLElement[] = [];
  for (const node of Array.from(contentDocument.querySelectorAll("*"))) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    if (!isOverlayScrollTrap(node)) {
      continue;
    }
    found.push(node);
  }
  return found;
}

export function isOverlayScrollTrap(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  if (view === null) {
    return false;
  }
  const style = view.getComputedStyle(element);
  if (style.position !== "fixed" && style.position !== "sticky") {
    return false;
  }
  return overflowLocked(style);
}

function unlockRoot(element: HTMLElement | null): void {
  if (element === null) {
    return;
  }
  unlockOverflow(element);
}

function unlockOverflow(element: HTMLElement): void {
  const view = element.ownerDocument.defaultView;
  if (view === null) {
    return;
  }
  const style = view.getComputedStyle(element);
  if (!overflowLocked(style)) {
    return;
  }
  element.style.setProperty("overflow", "auto", "important");
  if (LOCKED_OVERFLOW.has(style.overflowY)) {
    element.style.setProperty("overflow-y", "auto", "important");
  }
  if (LOCKED_OVERFLOW.has(style.overflowX)) {
    element.style.setProperty("overflow-x", "auto", "important");
  }
}

function overflowLocked(style: CSSStyleDeclaration): boolean {
  return (
    LOCKED_OVERFLOW.has(style.overflow) ||
    LOCKED_OVERFLOW.has(style.overflowY) ||
    LOCKED_OVERFLOW.has(style.overflowX)
  );
}
