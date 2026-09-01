export interface PopupSuppressGuard {
  setActive(active: boolean): void;
  disconnect(): void;
}

export function hasUserGesture(view: Window, event?: Event): boolean {
  if (event?.isTrusted === true) {
    return true;
  }
  const activation = view.navigator.userActivation;
  return activation !== undefined && activation.isActive === true;
}

export function installPopupSuppressGuard(
  view: Window,
  active: boolean = true,
): PopupSuppressGuard {
  let enabled = active;
  const originalOpen = view.open.bind(view);

  view.open = ((...args: Parameters<Window["open"]>) => {
    if (!enabled || hasUserGesture(view)) {
      return originalOpen(...args);
    }
    return null;
  }) as Window["open"];

  const onClick = (event: Event): void => {
    if (!enabled || !event.cancelable) {
      return;
    }
    if (hasUserGesture(view, event)) {
      return;
    }
    if (blankNavigationTarget(event.target) === undefined) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  view.addEventListener("click", onClick, true);

  return {
    setActive(next) {
      enabled = next;
    },
    disconnect() {
      view.open = originalOpen;
      view.removeEventListener("click", onClick, true);
    },
  };
}

function blankNavigationTarget(value: EventTarget | null): Element | undefined {
  if (typeof value !== "object" || value === null || !("closest" in value)) {
    return undefined;
  }
  const element = value as Element;
  const candidate = element.closest("a[target], area[target]");
  if (candidate === null) {
    return undefined;
  }
  const target = candidate.getAttribute("target");
  if (target === null || target.trim().toLowerCase() !== "_blank") {
    return undefined;
  }
  return candidate;
}
