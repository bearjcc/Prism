import {
  DEFAULT_ORIGIN_DENY_POLICY,
  isExactOrigin,
  normaliseOriginDenyPolicy,
  policyActiveForUrl,
  updateOriginDenyPolicy,
  type OriginDenyPolicyState,
} from "./origin-deny-policy.js";
import { BEHAVIOUR_POLICY_STORAGE_KEYS } from "./behaviour-policies.js";

export const PASTE_POLICY_STORAGE_KEY = BEHAVIOUR_POLICY_STORAGE_KEYS.paste;

export type PastePolicyState = OriginDenyPolicyState;

export const DEFAULT_PASTE_POLICY: PastePolicyState = DEFAULT_ORIGIN_DENY_POLICY;

export const PASTE_GUARD_EVENTS = [
  "paste",
  "beforeinput",
  "drop",
  "input",
] as const;

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "number",
  "",
]);

export { isExactOrigin };

export const normalisePastePolicy = normaliseOriginDenyPolicy;

export const pasteAllowedForUrl = policyActiveForUrl;

export const updatePastePolicy = updateOriginDenyPolicy;

export interface PasteAllowGuard {
  setAllowed(allowed: boolean): void;
  disconnect(): void;
}

export function isPasswordField(element: EventTarget | null): boolean {
  const input = asHtmlInput(element);
  return input !== undefined && input.type === "password";
}

export function isOrdinaryTextField(element: EventTarget | null): boolean {
  const node = asHtmlElement(element);
  if (node === undefined) {
    return false;
  }
  if (node.tagName === "TEXTAREA") {
    return true;
  }
  const input = asHtmlInput(node);
  if (input !== undefined) {
    return input.type !== "password" && TEXT_INPUT_TYPES.has(input.type);
  }
  return node.isContentEditable;
}

export function installPasteAllowGuard(
  contentDocument: Document,
  allowed: boolean = true,
): PasteAllowGuard {
  let allow = allowed;
  const view = contentDocument.defaultView;
  const target: EventTarget = view ?? contentDocument;

  const onEvent = (event: Event): void => {
    if (!allow || !event.cancelable) {
      return;
    }
    const field = event.target;
    if (isPasswordField(field) || !isOrdinaryTextField(field)) {
      return;
    }
    event.stopImmediatePropagation();
  };

  for (const type of PASTE_GUARD_EVENTS) {
    target.addEventListener(type, onEvent, true);
  }

  return {
    setAllowed(next) {
      allow = next;
    },
    disconnect() {
      for (const type of PASTE_GUARD_EVENTS) {
        target.removeEventListener(type, onEvent, true);
      }
    },
  };
}

function asHtmlElement(value: EventTarget | null): HTMLElement | undefined {
  if (typeof value !== "object" || value === null || !("tagName" in value)) {
    return undefined;
  }
  return value as HTMLElement;
}

function asHtmlInput(value: EventTarget | null): HTMLInputElement | undefined {
  const element = asHtmlElement(value);
  if (element === undefined || element.tagName !== "INPUT") {
    return undefined;
  }
  return element as HTMLInputElement;
}
