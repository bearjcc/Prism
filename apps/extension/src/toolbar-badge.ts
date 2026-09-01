export function isInjectablePageUrl(url: string | undefined): boolean {
  if (url === undefined || url === "") {
    return false;
  }
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function toolbarBadgeText(enabledOnTab: number): string {
  if (enabledOnTab < 1) {
    return "";
  }
  return enabledOnTab > 99 ? "99+" : String(enabledOnTab);
}

export function toolbarTitle(options: {
  readonly injectable: boolean;
  readonly enabledOnTab: number;
}): string {
  if (!options.injectable) {
    return "Prism cannot run on this page.";
  }
  if (options.enabledOnTab < 1) {
    return "Prism";
  }
  if (options.enabledOnTab === 1) {
    return "Prism: 1 mod enabled on this page.";
  }
  return `Prism: ${options.enabledOnTab} mods enabled on this page.`;
}
