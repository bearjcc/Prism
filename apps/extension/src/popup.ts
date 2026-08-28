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
  readonly tabs: {
    query(query: { active: true; currentWindow: true }): Promise<
      Array<{ id?: number }>
    >;
  };
}

declare const chrome: PopupChromeApi;

const modsRoot = requiredElement("mods");
const undoButton = requiredElement("undo");

undoButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) {
    await chrome.runtime.sendMessage({
      type: "undo-last",
      tabId: tab.id,
    });
  }
});

void renderMods();

async function renderMods(): Promise<void> {
  const mods = await chrome.runtime.sendMessage<PopupMod[]>({
    type: "list-mods",
  });
  modsRoot.replaceChildren();
  if (mods.length === 0) {
    modsRoot.textContent = "No bundled mods.";
    return;
  }
  for (const mod of mods) {
    modsRoot.append(renderMod(mod));
  }
}

function renderMod(mod: PopupMod): HTMLElement {
  const section = document.createElement("section");
  section.className = "mod";

  const heading = document.createElement("div");
  heading.className = "mod-heading";
  const name = document.createElement("h2");
  name.textContent = mod.manifest.id;
  const enabled = checkbox("Enabled", mod.enabled, async (checked) => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await chrome.runtime.sendMessage({
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
          await chrome.runtime.sendMessage({
            type: "set-capability",
            modId: mod.manifest.id,
            capability,
            granted,
          });
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
  onChange: (checked: boolean) => Promise<void>,
): HTMLLabelElement {
  const label = document.createElement("label");
  const text = document.createElement("span");
  text.textContent = labelText;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => {
    void onChange(input.checked);
  });
  label.append(text, input);
  return label;
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing popup element ${id}`);
  }
  return element;
}
