export const CONTEXT_MENU_PRISM_ROOT = "prism-root";
export const CONTEXT_MENU_IMMICH_UPLOAD = "prism-immich-upload";
export const CONTEXT_MENU_HIDE_SESSION = "prism-hide-element-session";
export const CONTEXT_MENU_HIDE_SITE = "prism-hide-element-site";
export const CONTEXT_MENU_PAUSE_SITE = "prism-pause-site";

export const CONTEXT_MENU_ITEMS = [
  {
    id: CONTEXT_MENU_HIDE_SESSION,
    title: "Hide this element",
  },
  {
    id: CONTEXT_MENU_HIDE_SITE,
    title: "Hide this element on this site",
  },
  {
    id: CONTEXT_MENU_PAUSE_SITE,
    title: "Pause Prism on this site",
  },
] as const;

export type ContextMenuCreateDetails = Readonly<{
  id: string;
  title: string;
  contexts: readonly string[];
  parentId?: string;
}>;

export type ContextMenusWriteApi = Readonly<{
  create(details: ContextMenuCreateDetails): void;
  remove(menuItemId: string): void | Promise<void>;
}>;

/** Static Prism submenu entries (Immich is added separately when the mod is active). */
export function registerPrismContextMenuItems(
  contextMenus: ContextMenusWriteApi,
): void {
  contextMenus.create({
    id: CONTEXT_MENU_PRISM_ROOT,
    title: "Prism",
    contexts: ["all"],
  });
  for (const item of CONTEXT_MENU_ITEMS) {
    contextMenus.create({
      id: item.id,
      parentId: CONTEXT_MENU_PRISM_ROOT,
      title: item.title,
      contexts: ["all"],
    });
  }
}

export const PRISM_CONTEXT_MENU_IDS = [
  CONTEXT_MENU_IMMICH_UPLOAD,
  ...CONTEXT_MENU_ITEMS.map((item) => item.id),
  CONTEXT_MENU_PRISM_ROOT,
] as const;

export async function rebuildPrismContextMenuTree(
  contextMenus: ContextMenusWriteApi,
  extraIds: readonly string[] = [],
): Promise<void> {
  const ids = [...extraIds, ...PRISM_CONTEXT_MENU_IDS];
  for (const id of ids) {
    try {
      await contextMenus.remove(id);
    } catch {
      // Item may not exist yet.
    }
  }
  registerPrismContextMenuItems(contextMenus);
}
