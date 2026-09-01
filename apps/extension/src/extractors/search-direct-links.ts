export interface SearchDirectLink {
  readonly id: string;
  readonly href: string;
  readonly title: string;
}

export interface SearchDirectLinksExtraction {
  readonly links: readonly SearchDirectLink[];
}

const OWNED_ATTRIBUTE = "data-prism-owned";
const OWNED_VALUE = "search-direct-link";

export const SEARCH_REDIRECT_ANCHOR_SELECTOR =
  'a[href*="/url?"], a[href*="/goto?"]';

export function searchPageHasWrappedLinks(root: ParentNode): boolean {
  return Array.from(
    root.querySelectorAll(SEARCH_REDIRECT_ANCHOR_SELECTOR),
  ).some((element) => element.getAttribute(OWNED_ATTRIBUTE) !== OWNED_VALUE);
}

export function applySearchDirectLinks(
  root: ParentNode,
): SearchDirectLinksExtraction {
  const baseUrl = documentUrl(root);
  const links: SearchDirectLink[] = [];
  let generated = 0;

  for (const element of Array.from(
    root.querySelectorAll<HTMLAnchorElement>("a[href]"),
  )) {
    const href = element.getAttribute("href");
    if (href === null) {
      continue;
    }
    const destination = unwrapSearchRedirect(href, baseUrl);
    if (destination === undefined) {
      if (isSearchRedirectHref(href, baseUrl)) {
        element.setAttribute(OWNED_ATTRIBUTE, OWNED_VALUE);
      }
      continue;
    }
    element.setAttribute("href", destination);
    element.removeAttribute("ping");
    element.setAttribute(OWNED_ATTRIBUTE, OWNED_VALUE);
    const id = element.id.trim() || `search-link:${generated}`;
    if (element.id.trim() === "") {
      generated += 1;
    }
    links.push({
      id,
      href: destination,
      title: element.textContent?.trim() ?? "",
    });
  }

  return { links };
}

function documentUrl(root: ParentNode): string {
  if (isDocument(root) && root.URL !== "") {
    return root.URL;
  }
  if (isElement(root) && root.ownerDocument.URL !== "") {
    return root.ownerDocument.URL;
  }
  return "https://www.google.com/";
}

function isSearchRedirectHref(href: string, baseUrl: string): boolean {
  const url = parseUrl(href, baseUrl);
  return url !== undefined && isSearchRedirectPath(url.pathname);
}

function unwrapSearchRedirect(href: string, baseUrl: string): string | undefined {
  const url = parseUrl(href, baseUrl);
  if (url === undefined || !isSearchRedirectPath(url.pathname)) {
    return undefined;
  }
  const raw = url.searchParams.get("q") ?? url.searchParams.get("url");
  if (raw === null || raw.trim() === "") {
    return undefined;
  }
  const destination = parseUrl(raw.trim(), baseUrl);
  if (
    destination === undefined ||
    (destination.protocol !== "https:" && destination.protocol !== "http:")
  ) {
    return undefined;
  }
  return destination.href;
}

function isSearchRedirectPath(pathname: string): boolean {
  return pathname === "/url" || pathname === "/goto";
}

function parseUrl(value: string, baseUrl: string): URL | undefined {
  try {
    return new URL(value, baseUrl);
  } catch {
    return undefined;
  }
}

function isDocument(node: ParentNode): node is Document {
  return "URL" in node && typeof (node as Document).createElement === "function";
}

function isElement(node: ParentNode): node is Element {
  return "ownerDocument" in node;
}
