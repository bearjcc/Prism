export const SAME_ORIGIN_USER_ACTIONS = [
  "consent.reject",
  "consent.dismiss",
] as const;

export type SameOriginUserActionId = (typeof SAME_ORIGIN_USER_ACTIONS)[number];

const ACTION_SELECTORS = {
  "consent.reject": "[data-prism-consent-reject]",
  "consent.dismiss": "[data-prism-consent-dismiss]",
} as const satisfies Record<SameOriginUserActionId, string>;

export type SameOriginActionResult =
  | {
      readonly ok: true;
      readonly action: SameOriginUserActionId;
      readonly matched: number;
    }
  | {
      readonly ok: false;
      readonly action: string;
      readonly reason: "refused";
    };

export function isSameOriginUserActionId(
  value: unknown,
): value is SameOriginUserActionId {
  return (
    typeof value === "string" &&
    (SAME_ORIGIN_USER_ACTIONS as readonly string[]).includes(value)
  );
}

export function performSameOriginUserAction(
  contentDocument: Document,
  action: string,
): SameOriginActionResult {
  if (!isSameOriginUserActionId(action)) {
    return { ok: false, action, reason: "refused" };
  }
  const view = contentDocument.defaultView;
  if (view === null) {
    return { ok: true, action, matched: 0 };
  }
  const selector = ACTION_SELECTORS[action];
  let matched = 0;
  for (const node of Array.from(contentDocument.querySelectorAll(selector))) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    if (!isSameOriginControl(node, contentDocument)) {
      continue;
    }
    if (!isVisibleControl(node, view)) {
      continue;
    }
    node.click();
    matched += 1;
  }
  return { ok: true, action, matched };
}

function isVisibleControl(element: HTMLElement, view: Window): boolean {
  if (!element.isConnected) {
    return false;
  }
  if (element.closest("[data-prism-consent-suppressed]") !== null) {
    return false;
  }
  return view.getComputedStyle(element).display !== "none";
}

function isSameOriginControl(
  element: HTMLElement,
  contentDocument: Document,
): boolean {
  if (element.ownerDocument !== contentDocument) {
    return false;
  }
  const view = contentDocument.defaultView;
  if (view === null) {
    return false;
  }
  try {
    return element.ownerDocument.location.origin === view.location.origin;
  } catch {
    return false;
  }
}
