import type { CapabilityId, PrismManifest } from "@prism/schema";
import {
  findAgeGateSiteRule,
  isSafeModSelector,
  readAgeGateRulesFromFiles,
  type AgeGateCookieRule,
  type AgeGateSiteRule,
} from "@prism/schema/age-gate-rules";
import type { ActivityEvent } from "./gate.js";
import { unlockRoot } from "./scroll-lock.js";

export const AGE_GATE_SUPPRESSED_MARK = "data-prism-age-gate-suppressed";

const AGE_GATE_CAPABILITY: CapabilityId = "site.ageGate.autoConfirm";

const AGE_TEXT_PATTERN =
  /\b(?:18\+|over\s*18|of\s+legal\s+age|age\s+verification|enter\s+site|adults?\s+only|you\s+must\s+be\s+18)\b/iu;

const AFFIRMATIVE_PATTERN =
  /\b(?:enter(?:\s+site)?|yes|i\s*am\s*(?:over\s*)?18|over\s*18|continue|agree|accept|confirm|proceed)\b/iu;

const REFUSED_BUTTON_PATTERN =
  /\b(?:under\s*18|leave|no\s+thanks|subscribe|sign[\s-]?up|log[\s-]?in|register|payment|date\s+of\s+birth|birth\s*day|dob)\b/iu;

const DATE_OF_BIRTH_FIELD_PATTERN =
  /\b(?:birth|dob|date\s+of\s+birth|day|month|year)\b/iu;

export type AgeGateActionId =
  | "ageGate.storage"
  | "ageGate.confirmClick"
  | "ageGate.overlayHide"
  | "ageGate.heuristicSkip"
  | "ageGate.genericConfirm"
  | "ageGate.genericHide";

export interface AgeGateEmit {
  (event: Extract<ActivityEvent, { layer: "mod-action" }>): void;
}

export interface AgeGateAutoConfirmOptions {
  readonly contentDocument: Document;
  readonly pageUrl: string;
  readonly manifest: PrismManifest;
  readonly modFiles?: Readonly<Record<string, Uint8Array>>;
  readonly emit?: AgeGateEmit;
}

export interface AgeGateAutoConfirmHandle {
  disconnect(): void;
}

export function preapplyAgeGateStorage(
  contentDocument: Document,
  pageUrl: string,
  modFiles: Readonly<Record<string, Uint8Array>> | undefined,
  siteRule?: AgeGateSiteRule,
): void {
  const rule =
    siteRule ??
    findAgeGateSiteRule(readAgeGateRulesFromFiles(modFiles).sites, pageUrl);
  if (rule === undefined) {
    return;
  }
  applySiteStorage(contentDocument, rule, undefined);
}

export function installAgeGateAutoConfirm(
  options: AgeGateAutoConfirmOptions,
): AgeGateAutoConfirmHandle & (() => void) {
  const rules = readAgeGateRulesFromFiles(options.modFiles).sites;
  const siteRule = findAgeGateSiteRule(rules, options.pageUrl);
  const undoStack: Array<() => void> = [];
  const view = options.contentDocument.defaultView;
  const MutationObserverCtor = view?.MutationObserver;
  let observer: MutationObserver | undefined;
  let disconnected = false;

  const emitAction = (
    action: AgeGateActionId,
    outcome: "applied" | "skipped" | "refused",
  ): void => {
    options.emit?.({
      layer: "mod-action",
      modId: options.manifest.id,
      capability: AGE_GATE_CAPABILITY,
      action,
      outcome,
    });
  };

  const runPass = (): void => {
    if (disconnected) {
      return;
    }
    if (siteRule !== undefined) {
      runSiteRulePass(options.contentDocument, siteRule, emitAction, undoStack);
      return;
    }
    runGenericHeuristicPass(
      options.contentDocument,
      emitAction,
      undoStack,
    );
  };

  if (MutationObserverCtor !== undefined) {
    observer = new MutationObserverCtor(() => {
      runPass();
    });
    observer.observe(options.contentDocument.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden", "aria-hidden"],
    });
  }

  preapplyAgeGateStorage(
    options.contentDocument,
    options.pageUrl,
    options.modFiles,
    siteRule,
  );
  runPass();

  const undo = (): void => {
    while (undoStack.length > 0) {
      const step = undoStack.pop();
      try {
        step?.();
      } catch {
        // Undo is best-effort on live hosts.
      }
    }
    disconnected = true;
    observer?.disconnect();
  };

  return Object.assign(undo, {
    disconnect() {
      undo();
    },
  });
}

function runSiteRulePass(
  contentDocument: Document,
  rule: AgeGateSiteRule,
  emit: (
    action: AgeGateActionId,
    outcome: "applied" | "skipped" | "refused",
  ) => void,
  undoStack: Array<() => void>,
): void {
  const storageUndo = applySiteStorage(contentDocument, rule, emit);
  if (storageUndo !== undefined) {
    undoStack.push(storageUndo);
  }
  if (rule.confirm !== undefined && isSafeModSelector(rule.confirm)) {
    const clicked = clickFirstVisible(
      contentDocument,
      rule.confirm,
      emit,
      "ageGate.confirmClick",
    );
    if (clicked) {
      undoStack.push(() => {});
    }
  }
  if (rule.overlay !== undefined && isSafeModSelector(rule.overlay)) {
    const hidden = hideOverlay(
      contentDocument,
      rule.overlay,
      emit,
      "ageGate.overlayHide",
    );
    if (hidden !== undefined) {
      undoStack.push(hidden);
    }
  }
  releaseDocumentScroll(contentDocument);
}

function runGenericHeuristicPass(
  contentDocument: Document,
  emit: (
    action: AgeGateActionId,
    outcome: "applied" | "skipped" | "refused",
  ) => void,
  undoStack: Array<() => void>,
): void {
  const candidates = findHeuristicAgeGateRoots(contentDocument);
  if (candidates.length === 0) {
    return;
  }
  for (const root of candidates) {
    if (rootHasDateOfBirthInputs(root)) {
      emit("ageGate.heuristicSkip", "skipped");
      const hidden = hideElementIfSafe(root, emit, "ageGate.genericHide");
      if (hidden !== undefined) {
        undoStack.push(hidden);
        releaseDocumentScroll(contentDocument);
      }
      continue;
    }
    const button = findAffirmativeButton(root);
    if (button === undefined) {
      emit("ageGate.heuristicSkip", "skipped");
      continue;
    }
    if (isRefusedControl(button)) {
      emit("ageGate.heuristicSkip", "refused");
      continue;
    }
    button.click();
    emit("ageGate.genericConfirm", "applied");
    undoStack.push(() => {});
    releaseDocumentScroll(contentDocument);
    return;
  }
}

function applySiteStorage(
  contentDocument: Document,
  rule: AgeGateSiteRule,
  emit?: (
    action: AgeGateActionId,
    outcome: "applied" | "skipped" | "refused",
  ) => void,
): (() => void) | undefined {
  const view = contentDocument.defaultView;
  if (view === null) {
    return undefined;
  }
  const undoSteps: Array<() => void> = [];
  let applied = false;
  if (rule.localStorage !== undefined) {
    for (const [key, value] of Object.entries(rule.localStorage)) {
      try {
        const previous = view.localStorage.getItem(key);
        view.localStorage.setItem(key, value);
        applied = true;
        undoSteps.push(() => {
          if (previous === null) {
            view.localStorage.removeItem(key);
          } else {
            view.localStorage.setItem(key, previous);
          }
        });
      } catch {
        // Storage may be blocked; fail soft.
      }
    }
  }
  if (rule.cookies !== undefined) {
    for (const cookie of rule.cookies) {
      if (setFirstPartyCookie(contentDocument, cookie)) {
        applied = true;
        undoSteps.push(() => {
          clearFirstPartyCookie(contentDocument, cookie.name);
        });
      }
    }
  }
  if (applied) {
    emit?.("ageGate.storage", "applied");
  }
  if (undoSteps.length === 0) {
    return undefined;
  }
  return () => {
    for (const step of undoSteps) {
      step();
    }
  };
}

function setFirstPartyCookie(
  contentDocument: Document,
  cookie: AgeGateCookieRule,
): boolean {
  const view = contentDocument.defaultView;
  if (view === null) {
    return false;
  }
  try {
    const maxAge =
      cookie.maxAgeDays === undefined
        ? ""
        : `; max-age=${Math.floor(cookie.maxAgeDays * 86_400)}`;
    view.document.cookie = `${cookie.name}=${encodeURIComponent(cookie.value)}; path=/${maxAge}; SameSite=Lax`;
    return true;
  } catch {
    return false;
  }
}

function clearFirstPartyCookie(contentDocument: Document, name: string): void {
  const view = contentDocument.defaultView;
  if (view === null) {
    return;
  }
  try {
    view.document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // Fail soft.
  }
}

function clickFirstVisible(
  contentDocument: Document,
  selector: string,
  emit: (
    action: AgeGateActionId,
    outcome: "applied" | "skipped" | "refused",
  ) => void,
  action: AgeGateActionId,
): boolean {
  const view = contentDocument.defaultView;
  if (view === null) {
    return false;
  }
  for (const node of Array.from(contentDocument.querySelectorAll(selector))) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    if (!isVisibleControl(node, view)) {
      continue;
    }
    if (isRefusedControl(node)) {
      emit(action, "refused");
      continue;
    }
    node.click();
    emit(action, "applied");
    return true;
  }
  return false;
}

function hideOverlay(
  contentDocument: Document,
  selector: string,
  emit: (
    action: AgeGateActionId,
    outcome: "applied" | "skipped" | "refused",
  ) => void,
  action: AgeGateActionId,
): (() => void) | undefined {
  const view = contentDocument.defaultView;
  if (view === null) {
    return undefined;
  }
  for (const node of Array.from(contentDocument.querySelectorAll(selector))) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    return hideElementIfSafe(node, emit, action);
  }
  return undefined;
}

function hideElementIfSafe(
  element: HTMLElement,
  emit: (
    action: AgeGateActionId,
    outcome: "applied" | "skipped" | "refused",
  ) => void,
  action: AgeGateActionId,
): (() => void) | undefined {
  if (element.hasAttribute(AGE_GATE_SUPPRESSED_MARK)) {
    return undefined;
  }
  const previousDisplay = element.style.getPropertyValue("display");
  const previousPriority = element.style.getPropertyPriority("display");
  element.setAttribute(AGE_GATE_SUPPRESSED_MARK, "");
  element.style.setProperty("display", "none", "important");
  emit(action, "applied");
  return () => {
    element.removeAttribute(AGE_GATE_SUPPRESSED_MARK);
    if (previousDisplay === "") {
      element.style.removeProperty("display");
    } else {
      element.style.setProperty(
        "display",
        previousDisplay,
        previousPriority || undefined,
      );
    }
  };
}

function findHeuristicAgeGateRoots(contentDocument: Document): HTMLElement[] {
  const view = contentDocument.defaultView;
  if (view === null) {
    return [];
  }
  const found: HTMLElement[] = [];
  for (const node of Array.from(
    contentDocument.querySelectorAll(
      '[role="dialog"], [aria-modal="true"], .modal, .overlay, [data-prism-age-gate]',
    ),
  )) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    if (!isVisibleControl(node, view)) {
      continue;
    }
    const text = readableText(node);
    if (!AGE_TEXT_PATTERN.test(text)) {
      continue;
    }
    found.push(node);
  }
  return found;
}

function findAffirmativeButton(root: HTMLElement): HTMLElement | undefined {
  const view = root.ownerDocument.defaultView;
  if (view === null) {
    return undefined;
  }
  const controls = root.querySelectorAll(
    "button, a[role='button'], input[type='button'], input[type='submit']",
  );
  for (const node of Array.from(controls)) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    if (!isVisibleControl(node, view)) {
      continue;
    }
    const label = readableText(node);
    if (REFUSED_BUTTON_PATTERN.test(label)) {
      continue;
    }
    if (AFFIRMATIVE_PATTERN.test(label)) {
      return node;
    }
  }
  return undefined;
}

function rootHasDateOfBirthInputs(root: HTMLElement): boolean {
  if (root.querySelector("input[type='date']") !== null) {
    return true;
  }
  for (const input of Array.from(
    root.querySelectorAll("input, select, textarea"),
  )) {
    const label = readableText(input);
    const name =
      input.getAttribute("name") ?? input.getAttribute("id") ?? input.getAttribute("placeholder") ?? "";
    if (
      DATE_OF_BIRTH_FIELD_PATTERN.test(label) ||
      DATE_OF_BIRTH_FIELD_PATTERN.test(name)
    ) {
      return true;
    }
  }
  return false;
}

function isRefusedControl(element: HTMLElement): boolean {
  return REFUSED_BUTTON_PATTERN.test(readableText(element));
}

function isVisibleControl(element: HTMLElement, view: Window): boolean {
  if (!element.isConnected) {
    return false;
  }
  if (element.closest(`[${AGE_GATE_SUPPRESSED_MARK}]`) !== null) {
    return false;
  }
  const style = view.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function readableText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/gu, " ").trim();
}

function releaseDocumentScroll(contentDocument: Document): void {
  unlockRoot(contentDocument.documentElement);
  if (contentDocument.body !== null) {
    unlockRoot(contentDocument.body);
  }
}
