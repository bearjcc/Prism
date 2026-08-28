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

if (typeof document !== "undefined" && typeof chrome !== "undefined") {
  initialisePopup(chrome, document);
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

function initialisePopup(api: PopupChromeApi, popupDocument: Document): void {
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
  void renderMods(api, modsRoot);
}

async function renderMods(
  api: PopupChromeApi,
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
    modsRoot.append(renderMod(api, mod));
  }
}

function renderMod(api: PopupChromeApi, mod: PopupMod): HTMLElement {
  const section = document.createElement("section");
  section.className = "mod";

  const heading = document.createElement("div");
  heading.className = "mod-heading";
  const name = document.createElement("h2");
  name.textContent = mod.manifest.id;
  const enabled = checkbox("Enabled", mod.enabled, async (checked) => {
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
  });
  heading.append(name, enabled);
  section.append(heading);

  const capabilities = document.createElement("div");
  capabilities.className = "capabilities";
  for (const capability of mod.manifest.capabilities.required) {
    const row = document.createElement("p");
    row.className = "required";
    row.textContent = `${capability} (required)`;
    capabilities.append(row);
  }
  for (const capability of mod.manifest.capabilities.optional ?? []) {
    capabilities.append(
      checkbox(
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
  }
  section.append(capabilities);
  return section;
}

function checkbox(
  labelText: string,
  checked: boolean,
  onChange: (checked: boolean) => Promise<boolean | void>,
): HTMLLabelElement {
  const label = document.createElement("label");
  const text = document.createElement("span");
  text.textContent = labelText;
  const input = document.createElement("input");
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

function requiredElement(popupDocument: Document, id: string): HTMLElement {
  const element = popupDocument.getElementById(id);
  if (element === null) {
    throw new Error(`Missing popup element ${id}`);
  }
  return element;
}
