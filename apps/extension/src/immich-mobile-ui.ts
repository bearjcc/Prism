import {
  IMMICH_CHIP_DISMISS_MS,
  IMMICH_CHIP_HOLD_MS,
  IMMICH_CHIP_LABEL,
  IMMICH_CHIP_MOVE_CANCEL_PX,
  imageSrcForUpload,
  isImageUploadTarget,
  touchHoldAfterElapsed,
} from "./immich-mobile-chip.js";

export type ImmichChipUploadHandler = (
  image: HTMLImageElement,
  srcUrl: string,
) => void;

export function installImmichMobileChip(
  document: Document,
  onUpload: ImmichChipUploadHandler,
): () => void {
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;
  let activeTouchId: number | undefined;
  let startX = 0;
  let startY = 0;
  let startedAtMs = 0;
  let movedPx = 0;
  let chip: HTMLButtonElement | undefined;
  let pendingImage: HTMLImageElement | undefined;

  function clearHoldTimer(): void {
    if (holdTimer !== undefined) {
      clearTimeout(holdTimer);
      holdTimer = undefined;
    }
  }

  function dismissChip(): void {
    clearHoldTimer();
    if (dismissTimer !== undefined) {
      clearTimeout(dismissTimer);
      dismissTimer = undefined;
    }
    chip?.remove();
    chip = undefined;
    pendingImage = undefined;
    activeTouchId = undefined;
    movedPx = 0;
  }

  function showChip(image: HTMLImageElement): void {
    dismissChip();
    pendingImage = image;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = IMMICH_CHIP_LABEL;
    button.setAttribute("aria-label", IMMICH_CHIP_LABEL);
    button.dataset.prismOwned = "immich-upload-chip";
    const rect = image.getBoundingClientRect();
    button.style.position = "fixed";
    button.style.zIndex = "2147483646";
    button.style.left = `${Math.min(rect.left + 8, globalThis.innerWidth - 180)}px`;
    button.style.top = `${Math.min(rect.bottom + 4, globalThis.innerHeight - 40)}px`;
    button.style.padding = "6px 10px";
    button.style.font = "13px system-ui, sans-serif";
    button.style.borderRadius = "6px";
    button.style.border = "1px solid #888";
    button.style.background = "#fff";
    button.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = pendingImage;
      if (target === undefined) {
        dismissChip();
        return;
      }
      onUpload(target, imageSrcForUpload(target));
      dismissChip();
    });
    document.body.append(button);
    chip = button;
    dismissTimer = setTimeout(() => dismissChip(), IMMICH_CHIP_DISMISS_MS);
  }

  function onTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 1) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (!isImageUploadTarget(target)) {
      return;
    }
    const touch = event.touches[0];
    if (touch === undefined) {
      return;
    }
    activeTouchId = touch.identifier;
    startX = touch.clientX;
    startY = touch.clientY;
    movedPx = 0;
    startedAtMs = performance.now();
    pendingImage = target;
    clearHoldTimer();
    holdTimer = setTimeout(() => {
      const state = touchHoldAfterElapsed(
        startedAtMs,
        performance.now(),
        movedPx,
      );
      if (state.outcome === "ready" && pendingImage !== undefined) {
        showChip(pendingImage);
      }
    }, IMMICH_CHIP_HOLD_MS);
  }

  function onTouchMove(event: TouchEvent): void {
    if (activeTouchId === undefined) {
      return;
    }
    const touch = Array.from(event.touches).find(
      (entry) => entry.identifier === activeTouchId,
    );
    if (touch === undefined) {
      return;
    }
    movedPx = Math.max(
      movedPx,
      Math.hypot(touch.clientX - startX, touch.clientY - startY),
    );
    if (movedPx > IMMICH_CHIP_MOVE_CANCEL_PX) {
      clearHoldTimer();
      pendingImage = undefined;
    }
  }

  function onTouchEnd(): void {
    clearHoldTimer();
    if (chip === undefined) {
      pendingImage = undefined;
      activeTouchId = undefined;
    }
  }

  function onOutsidePointer(event: Event): void {
    if (chip === undefined) {
      return;
    }
    if (event.target instanceof Node && chip.contains(event.target)) {
      return;
    }
    dismissChip();
  }

  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("touchend", onTouchEnd, { passive: true });
  document.addEventListener("touchcancel", onTouchEnd, { passive: true });
  document.addEventListener("scroll", dismissChip, {
    passive: true,
    capture: true,
  });
  document.addEventListener("pointerdown", onOutsidePointer, true);

  return dismissChip;
}
