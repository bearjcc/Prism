import type { CapabilityId, PrismManifest } from "@prism/schema";
import type { BehaviourPolicyId } from "./behaviour-policies.js";
import type { StoredActivityEvent } from "./gate.js";
import type { ModTrustKind } from "./loader.js";
import { classifyModTrust } from "./loader.js";
import {
  formatPageActivityRow,
  pageActivityRows,
  type PageActivityMod,
} from "./page-activity.js";
import { encodeArchiveForStorage } from "./packed-mod.js";
import {
  findModsExploreUrl,
  findModsLabel,
} from "./find-mods.js";
import {
  describeFindMods,
  describePinHint,
  partitionModsForPage,
} from "./popup-mods.js";
import { describeOriginRuntimePause } from "./origin-runtime-pause.js";

interface PopupMod {
  readonly manifest: PrismManifest;
  readonly enabled: boolean;
  readonly grants: readonly CapabilityId[];
  readonly origin?: "bundled" | "imported";
  readonly disabledOnOrigin?: boolean;
  readonly pausedOnOrigin?: boolean;
  readonly sessionExceptedOnOrigin?: boolean;
  readonly trustKind?: ModTrustKind;
  readonly entry?: string | null;
  readonly styles?: readonly string[];
}

interface PopupChromeApi {
  readonly runtime: {
    sendMessage<T>(message: unknown): Promise<T>;
  };
  readonly permissions: {
    request(permissions: { origins: string[] }): Promise<boolean>;
    remove(permissions: { origins: string[] }): Promise<boolean>;
  };
  readonly tabs: {
    query(query: { active: true; currentWindow: true }): Promise<
      Array<{ id?: number; url?: string }>
    >;
    create?(properties: { url: string }): Promise<unknown>;
  };
}

declare const chrome: PopupChromeApi;

const REDDIT_ORIGINS = ["https://www.reddit.com/*"];
const SPONSORBLOCK_ORIGINS = ["https://sponsor.ajay.app/*"];

const CAPABILITY_HOST_ORIGINS: Partial<
  Record<CapabilityId, readonly string[]>
> = {
  "reddit.comments.search": REDDIT_ORIGINS,
  "youtube.watch.sponsorSegments": SPONSORBLOCK_ORIGINS,
};

const OPTIONAL_CAPABILITY_DISCLOSURE: Partial<
  Record<CapabilityId, string>
> = {
  "reddit.comments.search":
    "Reddit comments search fetches reddit.com in the extension background so YouTube watch can list comments. The mod receives JSON only, never HTML or cookies. Chromium prompts for https://www.reddit.com/* when you enable this.",
  "youtube.watch.sponsorSegments":
    "Sponsor skip times are fetched from sponsor.ajay.app in the extension background. The mod receives JSON segment times only, never the SponsorBlock page. The extension seeks the watch player across those skip ranges. Chromium prompts for https://sponsor.ajay.app/* when you enable a mod that requires this.",
  "reddit.feed.posts":
    "Reddit feed posts returns JSON titles and opaque handles for labelled feed units. The mod never sees post HTML. Keyword hide uses visual.hide against those handles.",
  "network.egress":
    "Remote kitten images stay off until granted. Requests go through the extension broker, not page fetch.",
  "network.browser.block":
    "Browser network block (DNR) applies only to declared third-party advert hosts. First-party YouTube adverts still need slot replacement.",
};

export function describeOptionalCapability(capability: CapabilityId): string {
  return OPTIONAL_CAPABILITY_DISCLOSURE[capability] ?? "";
}

export function hostOriginsForCapabilities(
  capabilities: readonly CapabilityId[],
): string[] {
  const origins = new Set<string>();
  for (const capability of capabilities) {
    for (const origin of CAPABILITY_HOST_ORIGINS[capability] ?? []) {
      origins.add(origin);
    }
  }
  return [...origins];
}

export function describeModHostAccess(manifest: PrismManifest): string {
  if (!manifest.scopes.includes("<all_urls>")) {
    return "";
  }
  return "This mod runs on all sites because advert slots are not tied to one origin. The content script matches every URL; the mod still only replaces extracted slots.";
}

export function pageOriginFromTabUrl(url: string | undefined): string | undefined {
  if (url === undefined || url === "") {
    return undefined;
  }
  try {
    const origin = new URL(url).origin;
    return origin.startsWith("http") ? origin : undefined;
  } catch {
    return undefined;
  }
}

export function describeActivityEvent(event: StoredActivityEvent): string {
  if (event.layer === "userscript-runtime") {
    return `${event.modId} userscript ${event.outcome}`;
  }
  return `${event.modId} ${event.capability} ${event.outcome}`;
}

export function describeModKind(kind: ModTrustKind): string {
  if (kind === "css") {
    return "CSS";
  }
  if (kind === "declarative") {
    return "CSS + JSON";
  }
  return "Userscript";
}

export function describeModPause(): string {
  return "Paused on this site after repeated failures.";
}

export function describeAllowOnce(): string {
  return "Allow once skips this mod or policy on this origin until the service worker restarts. Disable on this site lasts across restarts.";
}

export function describeUserscriptRequirement(): string {
  return "This mod's JavaScript is a userscript. It runs only in Chromium's isolated USER_SCRIPT world, only on the package's declared scopes, and is refused if the source lists remote script URLs. CSS, JSON, and filter lists still run through the extension. Chromium 138+ requires Allow User Scripts on this extension's details page; older Chrome uses Developer mode. If that toggle is off, the script is a no-op.";
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
  const origins = hostOriginsForCapabilities([capability]);
  if (
    granted &&
    origins.length > 0 &&
    !(await api.permissions.request({ origins }))
  ) {
    return false;
  }
  await api.runtime.sendMessage({
    type: "set-capability",
    modId,
    capability,
    granted,
  });
  if (!granted && origins.length > 0) {
    await api.permissions.remove({ origins });
  }
  return true;
}

export async function requestRequiredCapabilityHosts(
  api: Pick<PopupChromeApi, "permissions">,
  capabilities: readonly CapabilityId[],
): Promise<boolean> {
  const origins = hostOriginsForCapabilities(capabilities);
  if (origins.length === 0) {
    return true;
  }
  return api.permissions.request({ origins });
}

export async function importPackedArchive(
  api: Pick<PopupChromeApi, "runtime">,
  file: Pick<Blob, "arrayBuffer">,
): Promise<{
  readonly ok: boolean;
  readonly id?: string;
  readonly error?: string;
}> {
  const response = await api.runtime.sendMessage<{
    readonly ok?: boolean;
    readonly id?: string;
    readonly error?: string;
  }>({
    type: "import-mod",
    archive: encodeArchiveForStorage(new Uint8Array(await file.arrayBuffer())),
  });
  if (response.ok !== true) {
    return { ok: false, error: response.error };
  }
  return { ok: true, id: response.id };
}

export async function mountPopup(
  api: PopupChromeApi,
  popupDocument: Document,
): Promise<void> {
  const modsRoot = requiredElement(popupDocument, "mods");
  const activityRoot = requiredElement(popupDocument, "activity");
  const pageActivityRoot = requiredElement(popupDocument, "page-activity");
  const undoButton = requiredElement(popupDocument, "undo");
  const pageOriginRoot = requiredElement(popupDocument, "page-origin");
  const policiesRoot = requiredElement(popupDocument, "global-policies");
  const pinHintRoot = popupDocument.getElementById("pin-hint");
  const findModsRoot = popupDocument.getElementById("find-mods");
  const otherModsRoot = popupDocument.getElementById("other-mods");
  const importInput = requiredElement(
    popupDocument,
    "import-mod",
  ) as HTMLInputElement;
  const importFeedback = popupDocument.getElementById("import-feedback");

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
  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (file === undefined) {
      return;
    }
    void importPackedArchive(api, file).then((result) => {
      importInput.value = "";
      if (result.ok) {
        if (importFeedback !== null) {
          importFeedback.textContent = `Imported ${result.id ?? "package"}. Reload the page to activate it.`;
        }
        return refreshPopup(
          api,
          popupDocument,
          modsRoot,
          activityRoot,
          pageActivityRoot,
          pageOriginRoot,
          policiesRoot,
          pinHintRoot,
          findModsRoot,
          otherModsRoot,
        );
      }
      if (importFeedback !== null) {
        importFeedback.textContent =
          result.error === undefined
            ? "Package refused by policy inspection."
            : `Package refused by policy inspection: ${result.error}`;
      }
      return undefined;
    });
  });
  await refreshPopup(
    api,
    popupDocument,
    modsRoot,
    activityRoot,
    pageActivityRoot,
    pageOriginRoot,
    policiesRoot,
    pinHintRoot,
    findModsRoot,
    otherModsRoot,
  );
}

async function refreshPopup(
  api: PopupChromeApi,
  popupDocument: Document,
  modsRoot: HTMLElement,
  activityRoot: HTMLElement,
  pageActivityRoot: HTMLElement,
  pageOriginRoot: HTMLElement,
  policiesRoot: HTMLElement,
  pinHintRoot: HTMLElement | null,
  findModsRoot: HTMLElement | null,
  otherModsRoot: HTMLElement | null,
): Promise<void> {
  const [tab] = await api.tabs.query({
    active: true,
    currentWindow: true,
  });
  const pageUrl = tab?.url;
  const pageOrigin = pageOriginFromTabUrl(pageUrl);
  pageOriginRoot.textContent =
    pageOrigin === undefined
      ? "Open a web page to set a site exception."
      : `This site: ${pageOrigin}`;
  await Promise.all([
    renderPinHint(api, popupDocument, pinHintRoot),
    renderFindMods(api, popupDocument, findModsRoot, pageOrigin),
    renderOriginPause(api, popupDocument, pageOrigin),
    renderGlobalPolicies(api, popupDocument, policiesRoot, pageOrigin),
    renderMods(
      api,
      popupDocument,
      modsRoot,
      pageOrigin,
      pageUrl,
      otherModsRoot,
    ),
    renderPageActivity(api, popupDocument, pageActivityRoot, pageOrigin),
    renderActivity(api, popupDocument, activityRoot),
  ]);
}

export function describePastePolicy(): string {
  return describeBehaviourPolicy();
}

export function describeBehaviourPolicy(): string {
  return "This is a Prism browser policy, not a mod capability. Mods do not receive document or fetch.";
}

export function describePastePolicyDefault(): string {
  return "Allow paste is on by default. Sites cannot cancel paste, beforeinput, or drop into ordinary text fields. Password fields keep the site and browser behaviour.";
}

export function describePopupSuppressPolicyDefault(): string {
  return "Unsolicited popup suppression is on by default. window.open and synthetic target=_blank navigation that are not a user gesture are blocked.";
}

export function describeTitleFreezePolicyDefault(): string {
  return "Stable title is on by default. After the first non-empty document.title, later mutations are restored.";
}

export function describeScrollLockPolicyDefault(): string {
  return "Scroll-lock release is on by default. overflow:hidden on html, body, and typical overlay traps is undone.";
}

export function describeOverlaySuppressPolicyDefault(): string {
  return "Modal and chatbot overlay suppression is on by default. Only labelled overlays ([data-prism-modal], [data-prism-chatbot]) are hidden by the extension. This is not a page-wide CSS dump.";
}

export function describeConsentRejectPolicyDefault(): string {
  return "Consent-interface rejection is on by default. Labelled fixture controls ([data-prism-consent-reject], [data-prism-consent-dismiss]) are clicked via an internal same-origin allowlist. This is not a GDPR legal implementation.";
}

export function describeAutoplayPolicyDefault(): string {
  return "Autoplay constraint is on by default. Labelled autonav toggles and autoplay on video/audio in the fixture are constrained. Site-owned players may still start media; this is not a mod capability.";
}

interface BehaviourPolicyPopupState {
  readonly default: boolean;
  readonly denyOrigins: readonly string[];
  readonly allow: boolean;
  readonly originDenied: boolean;
  readonly sessionDeniedOnOrigin: boolean;
}

type BehaviourPoliciesPopupState = Record<
  BehaviourPolicyId,
  BehaviourPolicyPopupState
>;

async function renderGlobalPolicies(
  api: PopupChromeApi,
  popupDocument: Document,
  policiesRoot: HTMLElement,
  pageOrigin: string | undefined,
): Promise<void> {
  const policies = await api.runtime.sendMessage<BehaviourPoliciesPopupState>({
    type: "get-behaviour-policies",
    ...(pageOrigin === undefined ? {} : { url: pageOrigin }),
  });
  policiesRoot.replaceChildren();
  const heading = popupDocument.createElement("h2");
  heading.textContent = "Global policies";
  policiesRoot.append(heading);
  appendPolicyControls(api, popupDocument, policiesRoot, pageOrigin, {
    id: "paste",
    heading: "Allow paste",
    originOff: "Turn off paste-allow on this site",
    defaultCopy: describePastePolicyDefault(),
    state: policies.paste,
  });
  appendPolicyControls(api, popupDocument, policiesRoot, pageOrigin, {
    id: "popup-suppress",
    heading: "Suppress unsolicited popups",
    originOff: "Turn off popup suppression on this site",
    defaultCopy: describePopupSuppressPolicyDefault(),
    state: policies["popup-suppress"],
  });
  appendPolicyControls(api, popupDocument, policiesRoot, pageOrigin, {
    id: "title-freeze",
    heading: "Keep page title stable",
    originOff: "Turn off title freeze on this site",
    defaultCopy: describeTitleFreezePolicyDefault(),
    state: policies["title-freeze"],
  });
  appendPolicyControls(api, popupDocument, policiesRoot, pageOrigin, {
    id: "scroll-lock",
    heading: "Release scroll lock",
    originOff: "Turn off scroll-lock release on this site",
    defaultCopy: describeScrollLockPolicyDefault(),
    state: policies["scroll-lock"],
  });
  appendPolicyControls(api, popupDocument, policiesRoot, pageOrigin, {
    id: "overlay-suppress",
    heading: "Hide labelled modals and chatbots",
    originOff: "Turn off overlay suppression on this site",
    defaultCopy: describeOverlaySuppressPolicyDefault(),
    state: policies["overlay-suppress"],
  });
  appendPolicyControls(api, popupDocument, policiesRoot, pageOrigin, {
    id: "consent-reject",
    heading: "Reject labelled consent panels",
    originOff: "Turn off consent rejection on this site",
    defaultCopy: describeConsentRejectPolicyDefault(),
    state: policies["consent-reject"],
  });
  appendPolicyControls(api, popupDocument, policiesRoot, pageOrigin, {
    id: "autoplay",
    heading: "Constrain autoplay",
    originOff: "Turn off autoplay constraint on this site",
    defaultCopy: describeAutoplayPolicyDefault(),
    state: policies.autoplay,
  });
}

function appendPolicyControls(
  api: PopupChromeApi,
  popupDocument: Document,
  policiesRoot: HTMLElement,
  pageOrigin: string | undefined,
  options: {
    readonly id: BehaviourPolicyId;
    readonly heading: string;
    readonly originOff: string;
    readonly defaultCopy: string;
    readonly state: BehaviourPolicyPopupState;
  },
): void {
  const title = popupDocument.createElement("h3");
  title.textContent = options.heading;
  policiesRoot.append(
    title,
    disclosure(popupDocument, describeBehaviourPolicy()),
    disclosure(popupDocument, options.defaultCopy),
    checkbox(
      popupDocument,
      options.heading,
      options.state.default !== false,
      async (checked) => {
        const response = await api.runtime.sendMessage<{ ok?: boolean }>(
          options.id === "paste"
            ? { type: "set-paste-policy", default: checked }
            : {
                type: "set-behaviour-policy",
                policy: options.id,
                default: checked,
              },
        );
        return response.ok === true;
      },
    ),
  );
  if (pageOrigin !== undefined) {
    policiesRoot.append(
      checkbox(
        popupDocument,
        options.originOff,
        options.state.originDenied === true,
        async (deny) => {
          const response = await api.runtime.sendMessage<{ ok?: boolean }>(
            options.id === "paste"
              ? {
                  type: "set-paste-policy",
                  origin: pageOrigin,
                  deny,
                }
              : {
                  type: "set-behaviour-policy",
                  policy: options.id,
                  origin: pageOrigin,
                  deny,
                },
          );
          return response.ok === true;
        },
      ),
    );
    policiesRoot.append(
      checkbox(
        popupDocument,
        "Allow once this session",
        options.state.sessionDeniedOnOrigin === true,
        async (excepted) => {
          const response = await api.runtime.sendMessage<{ ok?: boolean }>({
            type: "set-session-exception",
            policy: options.id,
            origin: pageOrigin,
            excepted,
          });
          return response.ok === true;
        },
      ),
    );
  }
}

async function renderMods(
  api: PopupChromeApi,
  popupDocument: Document,
  modsRoot: HTMLElement,
  pageOrigin: string | undefined,
  pageUrl: string | undefined,
  otherModsRoot: HTMLElement | null,
): Promise<void> {
  const mods = await api.runtime.sendMessage<PopupMod[]>({
    type: "list-mods",
    ...(pageOrigin === undefined ? {} : { url: pageOrigin }),
  });
  modsRoot.replaceChildren();
  otherModsRoot?.replaceChildren();
  if (!Array.isArray(mods) || mods.length === 0) {
    modsRoot.textContent = "No bundled mods.";
    return;
  }
  const { matching, other } = partitionModsForPage(mods, pageUrl);
  const matchingList = otherModsRoot === null ? mods : matching;
  if (matchingList.length === 0 && otherModsRoot !== null) {
    modsRoot.textContent = "No mods match this page.";
  } else {
    for (const mod of matchingList) {
      modsRoot.append(renderMod(api, popupDocument, mod, pageOrigin));
    }
  }
  if (otherModsRoot !== null) {
    if (other.length === 0) {
      return;
    }
    const heading = popupDocument.createElement("h2");
    heading.textContent = "Other mods";
    otherModsRoot.append(heading);
    for (const mod of other) {
      otherModsRoot.append(renderMod(api, popupDocument, mod, pageOrigin));
    }
  }
}

async function renderPinHint(
  api: PopupChromeApi,
  popupDocument: Document,
  pinHintRoot: HTMLElement | null,
): Promise<void> {
  if (pinHintRoot === null) {
    return;
  }
  const chromeState = await api.runtime.sendMessage<{
    readonly pinHintDismissed?: boolean;
  }>({ type: "get-popup-chrome" });
  pinHintRoot.replaceChildren();
  if (chromeState.pinHintDismissed === true) {
    pinHintRoot.hidden = true;
    return;
  }
  pinHintRoot.hidden = false;
  const copy = popupDocument.createElement("p");
  copy.textContent = describePinHint();
  const dismiss = popupDocument.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Got it";
  dismiss.addEventListener("click", () => {
    void api.runtime.sendMessage({ type: "dismiss-pin-hint" }).then(() => {
      pinHintRoot.hidden = true;
    });
  });
  pinHintRoot.append(copy, dismiss);
}

async function renderFindMods(
  api: PopupChromeApi,
  popupDocument: Document,
  findModsRoot: HTMLElement | null,
  pageOrigin: string | undefined,
): Promise<void> {
  if (findModsRoot === null) {
    return;
  }
  findModsRoot.replaceChildren();
  if (pageOrigin === undefined) {
    return;
  }
  const hostname = new URL(pageOrigin).hostname;
  const href = findModsExploreUrl(hostname);
  const link = popupDocument.createElement("a");
  link.href = href;
  link.textContent = findModsLabel(hostname);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    void api.tabs.create?.({ url: href });
  });
  findModsRoot.append(link, disclosure(popupDocument, describeFindMods()));
}

async function renderOriginPause(
  api: PopupChromeApi,
  popupDocument: Document,
  pageOrigin: string | undefined,
): Promise<void> {
  const root = popupDocument.getElementById("origin-pause");
  if (root === null) {
    return;
  }
  root.replaceChildren();
  if (pageOrigin === undefined) {
    return;
  }
  const chromeState = await api.runtime.sendMessage<{
    readonly runtimePaused?: boolean;
  }>({
    type: "get-popup-chrome",
    url: pageOrigin,
  });
  root.append(
    checkbox(
      popupDocument,
      "Pause Prism on this site",
      chromeState.runtimePaused === true,
      async (paused) => {
        const response = await api.runtime.sendMessage<{ ok?: boolean }>({
          type: "set-runtime-pause",
          origin: pageOrigin,
          paused,
        });
        return response.ok === true;
      },
    ),
    disclosure(popupDocument, describeOriginRuntimePause()),
  );
}

function renderMod(
  api: PopupChromeApi,
  popupDocument: Document,
  mod: PopupMod,
  pageOrigin: string | undefined,
): HTMLElement {
  const section = popupDocument.createElement("section");
  section.className = "mod";

  const heading = popupDocument.createElement("div");
  heading.className = "mod-heading";
  const name = popupDocument.createElement("h2");
  name.textContent =
    mod.origin === "imported"
      ? `${mod.manifest.id} (imported)`
      : mod.manifest.id;
  const kind =
    mod.trustKind ??
    classifyModTrust({
      manifest: mod.manifest,
      entry: mod.entry ?? null,
      styles: mod.styles,
    });
  const badge = popupDocument.createElement("span");
  badge.className = `mod-kind mod-kind-${kind}`;
  badge.textContent = describeModKind(kind);
  const enabled = checkbox(
    popupDocument,
    "Enabled",
    mod.enabled,
    async (checked) => {
      if (checked && mod.manifest.runtime === "userscript") {
        await api.permissions.request({ origins: ["<all_urls>"] });
      }
      if (
        checked &&
        !(await requestRequiredCapabilityHosts(
          api,
          mod.manifest.capabilities.required,
        ))
      ) {
        return false;
      }
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
  heading.append(name, badge, enabled);
  section.append(heading);

  if (mod.pausedOnOrigin === true && pageOrigin !== undefined) {
    const paused = popupDocument.createElement("p");
    paused.className = "mod-paused";
    paused.textContent = describeModPause();
    section.append(paused);
    section.append(
      checkbox(
        popupDocument,
        "Resume on this site",
        false,
        async () => {
          await api.runtime.sendMessage({
            type: "set-mod-pause",
            modId: mod.manifest.id,
            origin: pageOrigin,
            paused: false,
          });
        },
      ),
    );
  }

  if (kind === "userscript") {
    section.append(disclosure(popupDocument, describeUserscriptRequirement()));
  }

  if (pageOrigin !== undefined) {
    section.append(
      checkbox(
        popupDocument,
        "Disable on this site",
        mod.disabledOnOrigin === true,
        async (excepted) => {
          await api.runtime.sendMessage({
            type: "set-site-exception",
            modId: mod.manifest.id,
            origin: pageOrigin,
            excepted,
          });
        },
      ),
      checkbox(
        popupDocument,
        "Allow once this session",
        mod.sessionExceptedOnOrigin === true,
        async (excepted) => {
          await api.runtime.sendMessage({
            type: "set-session-exception",
            modId: mod.manifest.id,
            origin: pageOrigin,
            excepted,
          });
        },
      ),
      disclosure(popupDocument, describeAllowOnce()),
    );
  }

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
    const copy = describeOptionalCapability(capability);
    if (copy !== "") {
      capabilities.append(disclosure(popupDocument, copy));
    }
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

async function renderPageActivity(
  api: PopupChromeApi,
  popupDocument: Document,
  pageActivityRoot: HTMLElement,
  pageOrigin: string | undefined,
): Promise<void> {
  const originPayload =
    pageOrigin === undefined ? {} : { url: pageOrigin };
  const [mods, policies, events] = await Promise.all([
    api.runtime.sendMessage<PopupMod[]>({
      type: "list-mods",
      ...originPayload,
    }),
    api.runtime.sendMessage<BehaviourPoliciesPopupState>({
      type: "get-behaviour-policies",
      ...originPayload,
    }),
    api.runtime.sendMessage<StoredActivityEvent[]>({
      type: "list-activity",
    }),
  ]);
  const rows = pageActivityRows(
    {
      mods: Array.isArray(mods) ? mods.map(pageActivityModFromPopup) : [],
      policies,
      activity: Array.isArray(events) ? events : [],
    },
    pageOrigin,
  );
  pageActivityRoot.replaceChildren();
  for (const row of rows) {
    const item = popupDocument.createElement("li");
    item.textContent = formatPageActivityRow(row);
    pageActivityRoot.append(item);
  }
}

function pageActivityModFromPopup(mod: PopupMod): PageActivityMod {
  return {
    id: mod.manifest.id,
    enabled: mod.enabled,
    scopes: mod.manifest.scopes,
    required: mod.manifest.capabilities.required,
    optional: mod.manifest.capabilities.optional ?? [],
    grants: mod.grants,
    disabledOnOrigin: mod.disabledOnOrigin,
    pausedOnOrigin: mod.pausedOnOrigin,
    sessionExceptedOnOrigin: mod.sessionExceptedOnOrigin,
  };
}

async function renderActivity(
  api: PopupChromeApi,
  popupDocument: Document,
  activityRoot: HTMLElement,
): Promise<void> {
  const events = await api.runtime.sendMessage<StoredActivityEvent[]>({
    type: "list-activity",
  });
  activityRoot.replaceChildren();
  if (!Array.isArray(events) || events.length === 0) {
    const empty = popupDocument.createElement("li");
    empty.textContent = "No capability decisions yet.";
    activityRoot.append(empty);
    return;
  }
  for (const event of events) {
    const item = popupDocument.createElement("li");
    item.textContent = describeActivityEvent(event);
    activityRoot.append(item);
  }
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
