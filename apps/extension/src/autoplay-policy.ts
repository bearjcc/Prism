import { constrainYoutubeAutoplay } from "./extractors/youtube-watch.js";

export interface AutoplayGuard {
  setActive(active: boolean): void;
  disconnect(): void;
}

export function installAutoplayGuard(
  contentDocument: Document,
  active: boolean = true,
): AutoplayGuard {
  let enabled = active;
  const view = contentDocument.defaultView;
  const MutationObserverCtor = view?.MutationObserver;
  let observer: MutationObserver | undefined;

  const apply = (): void => {
    if (!enabled) {
      return;
    }
    constrainYoutubeAutoplay(contentDocument);
    constrainGenericAutoplayMedia(contentDocument);
  };

  if (MutationObserverCtor !== undefined) {
    observer = new MutationObserverCtor(() => {
      apply();
    });
    observer.observe(contentDocument.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["autoplay", "aria-checked", "class"],
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

function constrainGenericAutoplayMedia(contentDocument: Document): void {
  const view = contentDocument.defaultView;
  if (view === null) {
    return;
  }
  for (const node of Array.from(
    contentDocument.querySelectorAll("video[autoplay], audio[autoplay]"),
  )) {
    if (
      node instanceof view.HTMLVideoElement ||
      node instanceof view.HTMLAudioElement
    ) {
      node.removeAttribute("autoplay");
    }
  }
}
