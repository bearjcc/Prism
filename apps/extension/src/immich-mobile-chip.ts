/** Long-press chip for Immich upload on touch browsers without extension context menus. */

export const IMMICH_CHIP_HOLD_MS = 500;
export const IMMICH_CHIP_MOVE_CANCEL_PX = 12;
export const IMMICH_CHIP_DISMISS_MS = 8000;
export const IMMICH_CHIP_LABEL = "Upload to Immich";

export type TouchHoldOutcome = "pending" | "ready" | "cancelled";

export type TouchHoldState = Readonly<{
  outcome: TouchHoldOutcome;
  elapsedMs: number;
  movedPx: number;
}>;

export function touchHoldAfterElapsed(
  startedAtMs: number,
  nowMs: number,
  movedPx: number,
  holdMs: number = IMMICH_CHIP_HOLD_MS,
  moveCancelPx: number = IMMICH_CHIP_MOVE_CANCEL_PX,
): TouchHoldState {
  if (movedPx > moveCancelPx) {
    return { outcome: "cancelled", elapsedMs: nowMs - startedAtMs, movedPx };
  }
  const elapsedMs = nowMs - startedAtMs;
  if (elapsedMs >= holdMs) {
    return { outcome: "ready", elapsedMs, movedPx };
  }
  return { outcome: "pending", elapsedMs, movedPx };
}

export function isImageUploadTarget(element: Element | null): element is HTMLImageElement {
  return element instanceof HTMLImageElement;
}

export function imageSrcForUpload(image: HTMLImageElement): string {
  if (image.currentSrc !== "") {
    return image.currentSrc;
  }
  return image.src;
}

export function preferImmichMobileChip(options: Readonly<{
  touchCapable: boolean;
  contextMenusSupported: boolean;
  mobileChipSetting: boolean | undefined;
}>): boolean {
  if (options.mobileChipSetting === true) {
    return true;
  }
  if (options.mobileChipSetting === false) {
    return false;
  }
  if (!options.contextMenusSupported) {
    return true;
  }
  return options.touchCapable;
}

export function detectTouchCapable(global: Readonly<{
  matchMedia?(query: string): MediaQueryList;
  ontouchstart?: unknown;
}>): boolean {
  try {
    if (global.matchMedia?.("(pointer: coarse)").matches === true) {
      return true;
    }
  } catch {
    // Ignore matchMedia failures in tests.
  }
  return global.ontouchstart !== undefined;
}

export function extensionContextMenusSupported(
  contextMenus: unknown,
): boolean {
  return (
    typeof contextMenus === "object" &&
    contextMenus !== null &&
    typeof (contextMenus as { create?: unknown }).create === "function"
  );
}
