import { sanitiseCss } from "@prism/schema/css";

const SESSION_MARK = "data-prism-session-hidden";
const SAFE_IDENT = /^[A-Za-z_][\w-]*$/u;
const SAFE_SELECTOR = /^[A-Za-z][\w-]*(?:#[A-Za-z_][\w-]*)?(?:\.[A-Za-z_][\w-]*)*(?::nth-of-type\(\d+\))?(?:\s*>\s*[A-Za-z][\w-]*(?:#[A-Za-z_][\w-]*)?(?:\.[A-Za-z_][\w-]*)*(?::nth-of-type\(\d+\))?)*$/u;

function elementParent(el: Element): Element | undefined {
  const value = el.parentElement;
  if (value === null) {
    return undefined;
  }
  return value;
}

export function cssSelectorForElement(element: Element): string | undefined {
  if (element.id !== "" && SAFE_IDENT.test(element.id)) {
    const tag = element.tagName.toLowerCase();
    return `${tag}#${element.id}`;
  }
  const chain: Element[] = [];
  let walk: Element | undefined = element;
  for (let depth = 0; depth < 6; depth += 1) {
    if (walk === undefined || elementParent(walk) === undefined) {
      break;
    }
    chain.unshift(walk);
    walk = elementParent(walk);
  }
  const parts: string[] = [];
  for (const item of chain) {
    const tag = item.tagName.toLowerCase();
    if (!SAFE_IDENT.test(tag)) {
      return undefined;
    }
    const parentEl = elementParent(item);
    if (parentEl === undefined) {
      return undefined;
    }
    const sameTag: Element[] = [];
    for (const child of Array.from(parentEl.children)) {
      if (child.tagName === item.tagName) {
        sameTag.push(child);
      }
    }
    const index = sameTag.indexOf(item) + 1;
    const classes = Array.from(item.classList)
      .filter((name) => SAFE_IDENT.test(name))
      .slice(0, 2);
    const classPart = classes.map((name) => `.${name}`).join("");
    parts.push(
      sameTag.length > 1
        ? `${tag}${classPart}:nth-of-type(${index})`
        : `${tag}${classPart}`,
    );
  }
  const selector = parts.join(" > ");
  return SAFE_SELECTOR.test(selector) ? selector : undefined;
}

export function hideRuleCss(selector: string): string | undefined {
  if (!SAFE_SELECTOR.test(selector)) {
    return undefined;
  }
  try {
    return sanitiseCss(`${selector}{display:none!important}`);
  } catch {
    return undefined;
  }
}

function isHtmlElement(element: Element): element is HTMLElement {
  const view = element.ownerDocument.defaultView;
  return view !== null && element instanceof view.HTMLElement;
}

export function applySessionHide(element: Element): boolean {
  if (!isHtmlElement(element)) {
    return false;
  }
  if (element.hasAttribute(SESSION_MARK)) {
    return false;
  }
  element.setAttribute(SESSION_MARK, "");
  element.style.setProperty("display", "none", "important");
  return true;
}

export function restoreSessionHide(element: Element): void {
  if (!isHtmlElement(element)) {
    return;
  }
  element.removeAttribute(SESSION_MARK);
  element.style.removeProperty("display");
}

export function applyPersistedHideRules(
  contentDocument: Document,
  selectors: readonly string[],
): void {
  const css = selectors
    .map((selector) => hideRuleCss(selector))
    .filter((rule): rule is string => rule !== undefined)
    .join("\n");
  let style = contentDocument.getElementById("prism-element-hides");
  if (css === "") {
    style?.remove();
    return;
  }
  if (style === null) {
    style = contentDocument.createElement("style");
    style.id = "prism-element-hides";
    contentDocument.documentElement.append(style);
  }
  style.textContent = css;
}

export function updateOriginHideSelectors(
  current: readonly string[] | undefined,
  selector: string,
  persist: boolean,
): string[] {
  const next = new Set(current ?? []);
  if (persist) {
    next.add(selector);
  } else {
    next.delete(selector);
  }
  return [...next];
}
