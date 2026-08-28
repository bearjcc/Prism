import type { CapabilityId, PrismManifest } from "@prism/schema";

interface PopupMod {
  readonly manifest: PrismManifest;
  readonly enabled: boolean;
  readonly grants: readonly CapabilityId[];
}

interface PopupChromeApi {
  readonly runtime: {
    sendMessage<T>(message: unknown): Promise<T>;
  };
  readonly permissions: {
    request(permissions: { origins: string[] }): Promise<boolean>;
  };
  readonly tabs: {
    query(query: { active: true; currentWindow: true }): Promise<
      Array<{ id?: number }>
    >;
  };
}

declare const chrome: PopupChromeApi;

const REDDIT_ORIGINS = ["https://www.reddit.com/*"];

const OPTIONAL_CAPABILITY_DISCLOSURE: Partial<
  Record<CapabilityId, string>
> = {
  "reddit.comments.search":
    "Reddit comments search fetches reddit.com in the extension background so YouTube watch can list comments. The mod receives JSON only, never HTML or cookies. Chromium prompts for https://www.reddit.com/* when you enable this.",
  "network.egress":
    "Remote kitten images stay off until granted. Requests go through the extension broker, not page fetch.",
  "network.browser.block":
    "Browser network block (DNR) applies only to declared third-party advert hosts. First-party YouTube adverts still need slot replacement.",
};

export function describeOptionalCapability(capability: CapabilityId): string {
  return OPTIONAL_CAPABILITY_DISCLOSURE[capability] ?? "";
}

export function describeModHostAccess(manifest: PrismManifest): string {
  if (!manifest.scopes.includes("<all_urls>")) {
    return "";
  }
  return "This mod runs on all sites because advert slots are not tied to one origin. The content script matches every URL; the mod still only replaces extracted slots.";
}

if (typeof document !== "undefined" && typeof chrome !== "undefined") {
  void mountPopup(chrome, document);
}

export async function applyOptionalCapabilityChange(
  api: Pick<PopupChromeApi, "permissions" | "runtime">,
  modId: string,
  capability: CapabilityId,
  granted: boolean,
): Promise<boolean> {
  if (
    granted &&
    capability === "reddit.comments.search" &&
    !(await api.permissions.request({ origins: REDDIT_ORIGINS }))
  ) {
    return false;
  }
  await api.runtime.sendMessage({
    type: "set-capability",
    modId,
    capability,
    granted,
  });
  return true;
}

export async function mountPopup(
  api: PopupChromeApi,
  popupDocument: Document,
): Promise<void> {
  const modsRoot = requiredElement(popupDocument, "mods");
  const undoButton = requiredElement(popupDocument, "undo");

  undoButton.addEventListener("click", async () => {
    const [tab] = await api.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id !== undefined) {
      await api.runtime.sendMessage({
        type: "undo-last",
        tabId: tab.id,
      });
    }
  });
  await renderMods(api, popupDocument, modsRoot);
}

async function renderMods(
  api: PopupChromeApi,
  popupDocument: Document,
  modsRoot: HTMLElement,
): Promise<void> {
  const mods = await api.runtime.sendMessage<PopupMod[]>({
    type: "list-mods",
  });
  modsRoot.replaceChildren();
  if (mods.length === 0) {
    modsRoot.textContent = "No bundled mods.";
    return;
  }
  for (const mod of mods) {
    modsRoot.append(renderMod(api, popupDocument, mod));
  }
}

function renderMod(
  api: PopupChromeApi,
  popupDocument: Document,
  mod: PopupMod,
): HTMLElement {
  const section = popupDocument.createElement("section");
  section.className = "mod";

  const heading = popupDocument.createElement("div");
  heading.className = "mod-heading";
  const name = popupDocument.createElement("h2");
  name.textContent = mod.manifest.id;
  const enabled = checkbox(
    popupDocument,
    "Enabled",
    mod.enabled,
    async (checked) => {
      const [tab] = await api.tabs.query({
        active: true,
        currentWindow: true,
      });
      await api.runtime.sendMessage({
        type: "set-enabled",
        modId: mod.manifest.id,
        enabled: checked,
        ...(tab?.id === undefined ? {} : { tabId: tab.id }),
      });
    },
  );
  heading.append(name, enabled);
  section.append(heading);

  const hostAccess = describeModHostAccess(mod.manifest);
  if (hostAccess !== "") {
    section.append(disclosure(popupDocument, hostAccess));
  }

  const capabilities = popupDocument.createElement("div");
  capabilities.className = "capabilities";
  for (const capability of mod.manifest.capabilities.required) {
    const row = popupDocument.createElement("p");
    row.className = "required";
    row.textContent = `${capability} (required)`;
    capabilities.append(row);
  }
  for (const capability of mod.manifest.capabilities.optional ?? []) {
    capabilities.append(
      checkbox(
        popupDocument,
        capability,
        mod.grants.includes(capability),
        async (granted) => {
          return applyOptionalCapabilityChange(
            api,
            mod.manifest.id,
            capability,
            granted,
          );
        },
      ),
    );
    const copy = describeOptionalCapability(capability);
    if (copy !== "") {
      capabilities.append(disclosure(popupDocument, copy));
    }
  }
  section.append(capabilities);
  return section;
}

function checkbox(
  popupDocument: Document,
  labelText: string,
  checked: boolean,
  onChange: (checked: boolean) => Promise<boolean | void>,
): HTMLLabelElement {
  const label = popupDocument.createElement("label");
  const text = popupDocument.createElement("span");
  text.textContent = labelText;
  const input = popupDocument.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => {
    const requested = input.checked;
    void onChange(requested).then((accepted) => {
      if (accepted === false) {
        input.checked = !requested;
      }
    });
  });
  label.append(text, input);
  return label;
}

function disclosure(
  popupDocument: Document,
  text: string,
): HTMLParagraphElement {
  const copy = popupDocument.createElement("p");
  copy.className = "disclosure";
  copy.textContent = text;
  return copy;
}

function requiredElement(popupDocument: Document, id: string): HTMLElement {
  const element = popupDocument.getElementById(id);
  if (element === null) {
    throw new Error(`Missing popup element ${id}`);
  }
  return element;
}
