import { describe, expect, test } from "vitest";
import {
  IMMICH_CHIP_HOLD_MS,
  IMMICH_CHIP_MOVE_CANCEL_PX,
  detectTouchCapable,
  extensionContextMenusSupported,
  preferImmichMobileChip,
  touchHoldAfterElapsed,
} from "./immich-mobile-chip.js";

describe("Immich mobile long-press detection", () => {
  test("ignores a short tap before hold duration", () => {
    expect(
      touchHoldAfterElapsed(0, 200, 0, IMMICH_CHIP_HOLD_MS, IMMICH_CHIP_MOVE_CANCEL_PX),
    ).toEqual({ outcome: "pending", elapsedMs: 200, movedPx: 0 });
  });

  test("fires ready after 500 ms with little movement", () => {
    expect(
      touchHoldAfterElapsed(0, 500, 4, IMMICH_CHIP_HOLD_MS, IMMICH_CHIP_MOVE_CANCEL_PX),
    ).toEqual({ outcome: "ready", elapsedMs: 500, movedPx: 4 });
  });

  test("cancels when the finger moves too far", () => {
    expect(
      touchHoldAfterElapsed(0, 600, IMMICH_CHIP_MOVE_CANCEL_PX + 1),
    ).toEqual({
      outcome: "cancelled",
      elapsedMs: 600,
      movedPx: IMMICH_CHIP_MOVE_CANCEL_PX + 1,
    });
  });

  test("prefers chip when context menus are unavailable", () => {
    expect(
      preferImmichMobileChip({
        touchCapable: false,
        contextMenusSupported: false,
        mobileChipSetting: undefined,
      }),
    ).toBe(true);
  });

  test("uses context menu on desktop when auto", () => {
    expect(
      preferImmichMobileChip({
        touchCapable: false,
        contextMenusSupported: true,
        mobileChipSetting: undefined,
      }),
    ).toBe(false);
  });

  test("detects coarse pointer as touch capable", () => {
    expect(
      detectTouchCapable({
        matchMedia: () => ({ matches: true }) as MediaQueryList,
      }),
    ).toBe(true);
  });

  test("extensionContextMenusSupported requires create()", () => {
    expect(extensionContextMenusSupported(undefined)).toBe(false);
    expect(extensionContextMenusSupported({ create: () => undefined })).toBe(
      true,
    );
  });
});
