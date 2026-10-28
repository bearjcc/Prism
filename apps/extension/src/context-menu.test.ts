import { describe, expect, test, vi } from "vitest";
import {
  CONTEXT_MENU_HIDE_SESSION,
  CONTEXT_MENU_IMMICH_UPLOAD,
  CONTEXT_MENU_PRISM_ROOT,
  registerPrismContextMenuItems,
} from "./context-menu.js";

describe("Prism context menu tree", () => {
  test("registers a Prism parent with hide and pause children", () => {
    const created: Array<Record<string, unknown>> = [];
    registerPrismContextMenuItems({
      create: (details) => {
        created.push({ ...details });
      },
      remove: vi.fn(),
    });
    expect(created[0]).toEqual({
      id: CONTEXT_MENU_PRISM_ROOT,
      title: "Prism",
      contexts: ["all"],
    });
    expect(
      created.filter((entry) => entry.parentId === CONTEXT_MENU_PRISM_ROOT),
    ).toHaveLength(3);
    expect(created.some((entry) => entry.id === CONTEXT_MENU_HIDE_SESSION)).toBe(
      true,
    );
  });

  test("Immich upload id is reserved for the image-only child", () => {
    expect(CONTEXT_MENU_IMMICH_UPLOAD).toBe("prism-immich-upload");
  });
});
