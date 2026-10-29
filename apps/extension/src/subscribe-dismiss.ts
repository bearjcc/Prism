import type { CapabilityId, PrismManifest } from "@prism/schema";
import {
  findSubscribeDismissSiteRules,
  readSubscribeDismissRulesFromFiles,
  type SubscribeDismissSiteRule,
  type SubscribeMarkupPlatform,
} from "@prism/schema/subscribe-dismiss-rules";
import type { ActivityEvent } from "./gate.js";
import {
  clickFirstMatchingSelector,
  createModActionEmitter,
  drainUndoStack,
  hideElementWithUndo,
  hideFirstMatchingSelector,
  installModalDismissGuard,
  isFixedOverlay,
  isVisibleModalControl,
  pushUndo,
  readableModalText,
  releaseDocumentScroll,
} from "./site-modal-dismiss.js";

const SUBSCRIBE_CAPABILITY: CapabilityId = "site.subscribe.dismiss";

const SUBSCRIBE_TEXT_PATTERN =
  /\b(?:subscribe|newsletter|keep\s+reading|join\s+(?:to\s+)?read|get\s+updates|email\s+updates|sign\s+up\s+to\s+read)\b/iu;

const AGE_TEXT_PATTERN =
  /\b(?:18\+|over\s*18|age\s+verification|enter\s+site|adults?\s+only)\b/iu;

const COOKIE_TEXT_PATTERN =
  /\b(?:cookie|cookies|gdpr|consent|privacy\s+preferences)\b/iu;

const LOGIN_TEXT_PATTERN =
  /\b(?:log\s*in|sign\s*in|password|forgot\s+password|create\s+account)\b/iu;

const PAYMENT_TEXT_PATTERN =
  /\b(?:checkout|payment|credit\s+card|billing|purchase|pay\s+now)\b/iu;

const NAV_TEXT_PATTERN =
  /\b(?:main\s+menu|navigation|site\s+map)\b/iu;

const DISMISS_BUTTON_PATTERN =
  /\b(?:no\s+thanks|not\s+now|maybe\s+later|close|dismiss|continue\s+reading|skip)\b/iu;

export type SubscribeDismissActionId =
  | "subscribe.dismissClick"
  | "subscribe.modalHide"
  | "subscribe.backdropHide"
  | "subscribe.heuristicSkip"
  | "subscribe.heuristicDismiss"
  | "subscribe.heuristicHide";

export interface SubscribeDismissEmit {
  (event: Extract<ActivityEvent, { layer: "mod-action" }>): void;
}

export interface SubscribeDismissOptions {
  readonly contentDocument: Document;
  readonly pageUrl: string;
  readonly manifest: PrismManifest;
  readonly modFiles?: Readonly<Record<string, Uint8Array>>;
  readonly emit?: SubscribeDismissEmit;
}

export interface SubscribeDismissHandle {
  disconnect(): void;
}

export function detectSubscribeMarkupPlatform(
  contentDocument: Document,
): SubscribeMarkupPlatform | undefined {
  if (
    contentDocument.querySelector(
      'script[src*="cdn-client.medium.com"], link[href*="medium.com/assets/"]',
    ) !== null
  ) {
    return "medium";
  }
  if (
    contentDocument.querySelector(
      'script[src*="substackcdn.com"], link[href*="substack.com/embed"], .substack-posts',
    ) !== null ||
    contentDocument.querySelector("iframe[src*='substack.com']") !== null
  ) {
    return "substack";
  }
  return undefined;
}

export function installSubscribeDismiss(
  options: SubscribeDismissOptions,
): SubscribeDismissHandle & (() => void) {
  const rules = readSubscribeDismissRulesFromFiles(options.modFiles).sites;
  const undoStack: Array<() => void> = [];
  const emitAction = createModActionEmitter(
    options.manifest.id,
    SUBSCRIBE_CAPABILITY,
    options.emit,
  );

  const guard = installModalDismissGuard({
    contentDocument: options.contentDocument,
    runPass: () => {
      const markup = detectSubscribeMarkupPlatform(options.contentDocument);
      const siteRules = findSubscribeDismissSiteRules(
        rules,
        options.pageUrl,
        markup,
      );
      if (siteRules.length > 0) {
        for (const rule of siteRules) {
          if (runSiteRulePass(options.contentDocument, rule, emitAction, undoStack)) {
            releaseDocumentScroll(options.contentDocument);
            return;
          }
        }
        return;
      }
      runGenericHeuristicPass(options.contentDocument, emitAction, undoStack);
    },
  });

  const undo = (): void => {
    drainUndoStack(undoStack);
    guard.disconnect();
  };

  return Object.assign(undo, {
    disconnect() {
      undo();
    },
  });
}

function runSiteRulePass(
  contentDocument: Document,
  rule: SubscribeDismissSiteRule,
  emit: ReturnType<typeof createModActionEmitter>,
  undoStack: Array<() => void>,
): boolean {
  if (rule.dismiss !== undefined) {
    if (
      clickFirstMatchingSelector(
        contentDocument,
        rule.dismiss,
        emit,
        "subscribe.dismissClick",
      )
    ) {
      undoStack.push(() => {});
      if (rule.backdrop !== undefined) {
        pushUndo(
          undoStack,
          hideFirstMatchingSelector(
            contentDocument,
            rule.backdrop,
            emit,
            "subscribe.backdropHide",
          ),
        );
      }
      return true;
    }
  }
  pushUndo(
    undoStack,
    hideFirstMatchingSelector(
      contentDocument,
      rule.modal,
      emit,
      "subscribe.modalHide",
    ),
  );
  if (rule.backdrop !== undefined) {
    pushUndo(
      undoStack,
      hideFirstMatchingSelector(
        contentDocument,
        rule.backdrop,
        emit,
        "subscribe.backdropHide",
      ),
    );
  }
  return true;
}

function runGenericHeuristicPass(
  contentDocument: Document,
  emit: ReturnType<typeof createModActionEmitter>,
  undoStack: Array<() => void>,
): void {
  for (const root of findHeuristicSubscribeRoots(contentDocument)) {
    if (!isSubscribeCandidate(root)) {
      emit("subscribe.heuristicSkip", "skipped");
      continue;
    }
    const dismiss = findDismissButton(root);
    if (dismiss !== undefined) {
      dismiss.click();
      emit("subscribe.heuristicDismiss", "applied");
      undoStack.push(() => {});
      hideKnownBackdrops(contentDocument, root, emit, undoStack);
      releaseDocumentScroll(contentDocument);
      return;
    }
    pushUndo(undoStack, hideElementWithUndo(root, emit, "subscribe.heuristicHide"));
    hideKnownBackdrops(contentDocument, root, emit, undoStack);
    releaseDocumentScroll(contentDocument);
    return;
  }
}

function hideKnownBackdrops(
  contentDocument: Document,
  root: HTMLElement,
  emit: ReturnType<typeof createModActionEmitter>,
  undoStack: Array<() => void>,
): void {
  const view = contentDocument.defaultView;
  if (view === null) {
    return;
  }
  for (const node of Array.from(
    contentDocument.querySelectorAll("[data-prism-subscribe-backdrop]"),
  )) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    pushUndo(
      undoStack,
      hideElementWithUndo(node, emit, "subscribe.backdropHide"),
    );
  }
  const parent = root.parentElement;
  if (parent === null) {
    return;
  }
  for (const sibling of Array.from(parent.children)) {
    if (sibling === root || !(sibling instanceof view.HTMLElement)) {
      continue;
    }
    if (!isFixedOverlay(sibling)) {
      continue;
    }
    const text = readableModalText(sibling);
    if (text.length > 40) {
      continue;
    }
    pushUndo(
      undoStack,
      hideElementWithUndo(sibling, emit, "subscribe.backdropHide"),
    );
  }
}

function findHeuristicSubscribeRoots(contentDocument: Document): HTMLElement[] {
  const view = contentDocument.defaultView;
  if (view === null) {
    return [];
  }
  const found: HTMLElement[] = [];
  for (const node of Array.from(
    contentDocument.querySelectorAll(
      '[role="dialog"], [aria-modal="true"], [data-prism-subscribe-modal]',
    ),
  )) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    if (!isVisibleModalControl(node, view)) {
      continue;
    }
    if (node.closest("[data-prism-consent]") !== null) {
      continue;
    }
    if (node.closest("[data-prism-age-gate]") !== null) {
      continue;
    }
    found.push(node);
  }
  return found;
}

function isSubscribeCandidate(root: HTMLElement): boolean {
  const text = readableModalText(root);
  if (AGE_TEXT_PATTERN.test(text)) {
    return false;
  }
  if (COOKIE_TEXT_PATTERN.test(text)) {
    return false;
  }
  if (LOGIN_TEXT_PATTERN.test(text) && !SUBSCRIBE_TEXT_PATTERN.test(text)) {
    return false;
  }
  if (PAYMENT_TEXT_PATTERN.test(text)) {
    return false;
  }
  if (NAV_TEXT_PATTERN.test(text)) {
    return false;
  }
  if (!SUBSCRIBE_TEXT_PATTERN.test(text)) {
    return false;
  }
  const hasEmail =
    root.querySelector("input[type='email'], input[name*='email' i]") !== null;
  const hasSubscribeControl =
    root.querySelector(
      "button, a[role='button'], input[type='submit']",
    ) !== null;
  if (!hasEmail && !hasSubscribeControl) {
    return false;
  }
  const view = root.ownerDocument.defaultView;
  if (view === null) {
    return false;
  }
  return isFixedOverlay(root) || root.getAttribute("role") === "dialog";
}

function findDismissButton(root: HTMLElement): HTMLElement | undefined {
  const view = root.ownerDocument.defaultView;
  if (view === null) {
    return undefined;
  }
  const controls = root.querySelectorAll(
    "button, a[role='button'], input[type='button']",
  );
  for (const node of Array.from(controls)) {
    if (!(node instanceof view.HTMLElement)) {
      continue;
    }
    if (!isVisibleModalControl(node, view)) {
      continue;
    }
    const label = readableModalText(node);
    if (DISMISS_BUTTON_PATTERN.test(label)) {
      return node;
    }
  }
  return undefined;
}
