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
