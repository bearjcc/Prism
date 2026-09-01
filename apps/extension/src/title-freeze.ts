export interface TitleFreezeGuard {
  setActive(active: boolean): void;
  disconnect(): void;
}

export function installTitleFreezeGuard(
  contentDocument: Document,
  active: boolean = true,
): TitleFreezeGuard {
  let enabled = active;
  let frozen: string | undefined;
  let applying = false;

  const descriptor = titleDescriptor(contentDocument);
  const nativeGet = descriptor?.get;
  const nativeSet = descriptor?.set;

  const readTitle = (): string => {
    if (nativeGet !== undefined) {
      return String(nativeGet.call(contentDocument));
    }
    return contentDocument.title;
  };

  const writeTitle = (value: string): void => {
    applying = true;
    try {
      if (nativeSet !== undefined) {
        nativeSet.call(contentDocument, value);
        return;
      }
      contentDocument.title = value;
    } finally {
      applying = false;
    }
  };

  const consider = (value: string): void => {
    if (!enabled) {
      writeTitle(value);
      return;
    }
    if (frozen === undefined) {
      if (value !== "") {
        frozen = value;
      }
      writeTitle(value);
      return;
    }
    if (value === frozen) {
      return;
    }
    writeTitle(frozen);
  };

  const initial = readTitle();
  if (initial !== "") {
    frozen = initial;
  }

  if (descriptor !== undefined && nativeGet !== undefined && nativeSet !== undefined) {
    try {
      Object.defineProperty(contentDocument, "title", {
        configurable: true,
        enumerable: descriptor.enumerable,
        get() {
          return nativeGet.call(contentDocument);
        },
        set(value: string) {
          consider(String(value));
        },
      });
    } catch {
      // JSDOM or the host may keep title as a non-configurable data property.
    }
  }

  const view = contentDocument.defaultView;
  const MutationObserverCtor = view?.MutationObserver;
  let observer: MutationObserver | undefined;
  if (MutationObserverCtor !== undefined) {
    observer = new MutationObserverCtor(() => {
      if (applying || !enabled) {
        return;
      }
      consider(readTitle());
    });
    observer.observe(contentDocument.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  return {
    setActive(next) {
      enabled = next;
      if (enabled) {
        const current = readTitle();
        if (frozen === undefined && current !== "") {
          frozen = current;
        } else if (frozen !== undefined && current !== frozen) {
          writeTitle(frozen);
        }
      }
    },
    disconnect() {
      observer?.disconnect();
      if (descriptor !== undefined) {
        Object.defineProperty(contentDocument, "title", descriptor);
      }
    },
  };
}

function titleDescriptor(
  contentDocument: Document,
): PropertyDescriptor | undefined {
  const own = Object.getOwnPropertyDescriptor(contentDocument, "title");
  if (own?.get !== undefined && own.set !== undefined) {
    return own;
  }
  const DocumentCtor = contentDocument.defaultView?.Document;
  if (DocumentCtor === undefined) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(DocumentCtor.prototype, "title");
}
