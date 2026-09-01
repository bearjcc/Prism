import type {
  BrokeredResponse,
  CapabilityId,
  PrismManifest,
} from "@prism/schema";
import { isCapabilityId } from "@prism/schema/capabilities";
import { DOMParser } from "linkedom/worker";
import {
  type DynamicRulesApi,
  type ReadBrowserFilter,
  compileCosmeticFilters,
  type CosmeticHideInstruction,
  syncBrowserBlockRules,
} from "./dnr.js";
import {
  appendActivityEvents,
  isActivityEvent,
  type StoredActivityEvent,
} from "./gate.js";
import type { BundledMod } from "./loader.js";
import {
  classifyModTrust,
  matchesAnyScope,
  parseBundledMods,
  probeUserScriptsAvailable,
  userscriptRegistrations,
  type UserScriptsApi,
} from "./loader.js";
import {
  MOD_FAILURE_BUDGET_STORAGE_KEY,
  isModPausedOnOrigin,
  mergeOriginExclusions,
  originFromPageUrl,
  pausedOriginsByMod,
  recordModFailure,
  recordModSuccess,
  setModPausedOnOrigin,
  type ModFailureBudgetState,
} from "./mod-pause.js";
import { loadImportedModsFromStorage } from "./compiled-package-cache.js";
import {
  decodeArchiveFromStorage,
  installedModFromPackedArchive,
  mergeInstalledMods,
} from "./packed-mod.js";
import {
  BEHAVIOUR_POLICY_STORAGE_KEYS,
  behaviourPoliciesResponse,
  behaviourPolicyResponse,
  isBehaviourPolicyId,
  readBehaviourPolicies,
  type BehaviourPolicyId,
  type BehaviourPolicyStorageKey,
} from "./behaviour-policies.js";
import {
  PASTE_POLICY_STORAGE_KEY,
  updatePastePolicy,
} from "./paste-policy.js";
import {
  updateOriginDenyPolicy,
  type OriginDenyPolicyState,
} from "./origin-deny-policy.js";
import {
  createSessionExceptionStore,
  isSessionExcepted,
  setSessionOriginException,
  type SessionExceptionStore,
} from "./session-exception.js";
import {
  CONTEXT_MENU_HIDE_SESSION,
  CONTEXT_MENU_HIDE_SITE,
  CONTEXT_MENU_ITEMS,
  CONTEXT_MENU_PAUSE_SITE,
} from "./context-menu.js";
import {
  hideRuleCss,
  updateOriginHideSelectors,
} from "./element-hide.js";
import {
  isOriginRuntimePaused,
  RUNTIME_PAUSED_ORIGINS_KEY,
  updateRuntimePausedOrigins,
} from "./origin-runtime-pause.js";
import {
  isInjectablePageUrl,
  toolbarBadgeText,
  toolbarTitle,
} from "./toolbar-badge.js";
import {
  createRedditCommentSearchUrl,
  parseRedditComments,
} from "./extractors/reddit-comments.js";
import {
  createSponsorSkipSegmentsUrl,
  parseSponsorSegments,
} from "./extractors/sponsor-segments.js";

interface RuntimeMessage {
  readonly type: string;
  readonly modId?: string;
  readonly enabled?: boolean;
  readonly capability?: string;
  readonly granted?: boolean;
  readonly url?: string;
  readonly tabId?: number;
  readonly contractId?: string;
  readonly query?: string;
  readonly videoId?: string;
  readonly archive?: string;
  readonly event?: unknown;
  readonly origin?: string;
  readonly excepted?: boolean;
  readonly paused?: boolean;
  readonly persist?: boolean;
  readonly selector?: string;
  readonly deny?: boolean;
  readonly default?: boolean;
  readonly policy?: string;
}

export interface RuntimeMessageSender {
  readonly id?: string;
  readonly url?: string;
  readonly tab?: { readonly id?: number };
}

export interface RuntimeMessageAuthentication {
  readonly extensionId: string;
  readonly popupUrl: string;
}

export type StoredState = {
  enabled?: Record<string, boolean>;
  grants?: Record<string, string[]>;
  importedArchives?: Record<string, string>;
  activity?: StoredActivityEvent[];
  siteExceptions?: Record<string, string[]>;
  runtimePausedOrigins?: string[];
  elementHides?: Record<string, string[]>;
  pinHintDismissed?: boolean;
  modFailureBudget?: ModFailureBudgetState;
} & Partial<Record<BehaviourPolicyStorageKey, OriginDenyPolicyState>>;

interface ChromeApi {
  readonly runtime: {
    readonly id: string;
    getURL(path: string): string;
    readonly onMessage: {
      addListener(
        listener: (
          message: RuntimeMessage,
          sender: RuntimeMessageSender,
          sendResponse: (response: unknown) => void,
        ) => boolean | void,
      ): void;
    };
  };
  readonly storage: {
    readonly local: {
      get(keys: string[]): Promise<StoredState>;
      set(state: StoredState): Promise<void>;
    };
  };
  readonly tabs: {
    query(query: Record<string, never>): Promise<Array<{ id?: number; url?: string }>>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    reload(tabId: number): Promise<void>;
  };
  readonly webNavigation: {
    readonly onHistoryStateUpdated: {
      addListener(
        listener: (details: {
          readonly frameId: number;
          readonly tabId: number;
          readonly url: string;
        }) => void,
      ): void;
    };
  };
  readonly declarativeNetRequest: DynamicRulesApi;
  readonly userScripts?: UserScriptsApi;
}

declare const chrome: ChromeApi;

export interface ServiceWorkerDependencies {
  readonly getState: () => Promise<StoredState>;
  readonly setState: (state: StoredState) => Promise<void>;
  readonly sendToTab: (
    tabId: number,
    message: unknown,
  ) => Promise<unknown>;
  readonly queryTabs: () => Promise<
    ReadonlyArray<{ readonly id?: number; readonly url?: string }>
  >;
  readonly reloadTab: (tabId: number) => Promise<void>;
  readonly sessionExceptions?: SessionExceptionStore;
  readonly reportToolbar?: (
    tabId: number,
    url: string,
    enabledCount: number,
  ) => void;
  readonly syncBrowserRules: (
    mods: readonly BundledMod[],
    enabled: Readonly<Record<string, boolean>>,
    grants: Readonly<Record<string, readonly string[]>>,
    siteExceptions?: Readonly<Record<string, readonly string[]>>,
  ) => Promise<void>;
  readonly readBrowserFilter?: ReadBrowserFilter;
  readonly fetchRedditHtml?: (query: string) => Promise<string>;
  readonly fetchSponsorSegmentsJson?: (videoId: string) => Promise<string>;
  readonly userScripts?: UserScriptsApi;
}

export async function loadBundledModIndex(
  fetchIndex: () => Promise<string>,
): Promise<BundledMod[]> {
  return parseBundledMods(await fetchIndex());
}

export function historyStateUpdatedMessage(details: {
  readonly frameId: number;
  readonly tabId: number;
  readonly url: string;
}): { readonly tabId: number; readonly message: RuntimeMessage } | undefined {
  if (details.frameId !== 0) {
    return undefined;
  }
  return {
    tabId: details.tabId,
    message: { type: "url-changed", url: details.url },
  };
}

export function forwardUndoToTab(
  sendToTab: (tabId: number, message: unknown) => Promise<unknown>,
  tabId: number,
): Promise<unknown> {
  return sendToTab(tabId, { type: "undo-last" });
}

export function pageOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export function updateSiteException(
  current: readonly string[] | undefined,
  origin: string,
  excepted: boolean,
): string[] {
  const selected = new Set(current ?? []);
  if (excepted) {
    selected.add(origin);
  } else {
    selected.delete(origin);
  }
  return [...selected];
}

export function selectActiveMods(
  mods: readonly BundledMod[],
  url: string,
  enabled: Readonly<Record<string, boolean>>,
  grants: Readonly<Record<string, readonly string[]>>,
  siteExceptions: Readonly<Record<string, readonly string[]>> = {},
  pausedOnOrigin: Readonly<Record<string, readonly string[]>> = {},
  sessionExceptions: Readonly<Record<string, readonly string[]>> = {},
  runtimePausedOrigins: readonly string[] = [],
): {
  readonly mods: ReadonlyArray<
    BundledMod & {
      readonly grants: readonly CapabilityId[];
      readonly cosmetics?: readonly CosmeticHideInstruction[];
    }
  >;
} {
  const origin = pageOrigin(url);
  return {
    mods: mods
      .filter(({ manifest }) => {
        if (
          origin !== undefined &&
          runtimePausedOrigins.includes(origin)
        ) {
          return false;
        }
        if (enabled[manifest.id] === false) {
          return false;
        }
        if (
          origin !== undefined &&
          (siteExceptions[manifest.id] ?? []).includes(origin)
        ) {
          return false;
        }
        if (
          origin !== undefined &&
          (pausedOnOrigin[manifest.id] ?? []).includes(origin)
        ) {
          return false;
        }
        if (
          origin !== undefined &&
          (sessionExceptions[manifest.id] ?? []).includes(origin)
        ) {
          return false;
        }
        return matchesAnyScope(manifest.scopes, url);
      })
      .map((mod) => ({
        ...mod,
        grants: (
          grants[mod.manifest.id] ?? mod.manifest.capabilities.required
        ).filter(isCapabilityId),
      })),
  };
}

export function updateOptionalGrant(
  manifest: PrismManifest,
  current: readonly string[],
  capability: string,
  granted: boolean,
): CapabilityId[] {
  const optional = manifest.capabilities.optional ?? [];
  if (!isCapabilityId(capability) || !optional.includes(capability)) {
    throw new Error(`${capability} is not optional for ${manifest.id}`);
  }

  const selected = new Set(
    current.filter(
      (entry): entry is CapabilityId =>
        isCapabilityId(entry) && optional.includes(entry),
    ),
  );
  if (granted) {
    selected.add(capability);
  } else {
    selected.delete(capability);
  }
  return [
    ...manifest.capabilities.required,
    ...optional.filter((entry) => selected.has(entry)),
  ];
}

if (typeof chrome !== "undefined") {
  const mods = loadBundledModIndex(async () => {
    const response = await fetch(chrome.runtime.getURL("bundled-mods.json"));
    if (!response.ok) {
      throw new Error(`Could not load bundled mods: ${response.status}`);
    }
    return response.text();
  });
  const dependencies = createChromeDependencies();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handleRuntimeMessage(
      message,
      sender,
      mods,
      dependencies,
      {
        extensionId: chrome.runtime.id,
        popupUrl: chrome.runtime.getURL("popup.html"),
      },
    ).then(sendResponse, () => sendResponse({ ok: false }));
    return true;
  });
  void syncInitialBrowserRules(mods, dependencies);
  const menus = (
    chrome as unknown as {
      runtime: {
        onInstalled: { addListener(listener: () => void): void };
      };
      contextMenus?: {
        create(details: {
          id: string;
          title: string;
          contexts: string[];
        }): void;
        onClicked: {
          addListener(
            listener: (
              info: { menuItemId: string | number },
              tab?: { id?: number; url?: string },
            ) => void,
          ): void;
        };
      };
    }
  );
  menus.runtime.onInstalled.addListener(() => {
    for (const item of CONTEXT_MENU_ITEMS) {
      menus.contextMenus?.create({
        id: item.id,
        title: item.title,
        contexts: ["all"],
      });
    }
  });
  menus.contextMenus?.onClicked.addListener((info, tab) => {
    if (tab?.id === undefined) {
      return;
    }
    if (info.menuItemId === CONTEXT_MENU_PAUSE_SITE) {
      const origin = tab.url === undefined ? undefined : pageOrigin(tab.url);
      if (origin === undefined) {
        void chrome.tabs.sendMessage(tab.id, { type: "pause-prism-here" });
        return;
      }
      void dependencies.getState().then((state) =>
        dependencies.setState({
          [RUNTIME_PAUSED_ORIGINS_KEY]: updateRuntimePausedOrigins(
            state.runtimePausedOrigins,
            origin,
            true,
          ),
        }),
      );
      if (tab.url !== undefined) {
        void chrome.tabs.sendMessage(tab.id, {
          type: "url-changed",
          url: tab.url,
        });
      }
      return;
    }
    if (
      info.menuItemId === CONTEXT_MENU_HIDE_SESSION ||
      info.menuItemId === CONTEXT_MENU_HIDE_SITE
    ) {
      void chrome.tabs.sendMessage(tab.id, {
        type: "hide-element",
        persist: info.menuItemId === CONTEXT_MENU_HIDE_SITE,
      });
    }
  });
  chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    const notification = historyStateUpdatedMessage(details);
    if (notification === undefined) {
      return;
    }
    void chrome.tabs
      .sendMessage(notification.tabId, notification.message)
      .catch(() => undefined);
  });
}

export async function handleRuntimeMessage(
  message: RuntimeMessage,
  sender: RuntimeMessageSender,
  modsPromise: Promise<BundledMod[]>,
  dependencies: ServiceWorkerDependencies,
  authentication: RuntimeMessageAuthentication,
): Promise<unknown> {
  if (!isAuthorisedRuntimeMessage(message, sender, authentication)) {
    return { ok: false };
  }
  const bundled = await modsPromise;
  const state = await dependencies.getState();
  const mods = resolveInstalledMods(bundled, state);
  const enabled = { ...state.enabled };
  const grants = { ...state.grants };
  const siteExceptions = { ...state.siteExceptions };
  let modFailureBudget = state.modFailureBudget;
  const behaviourPolicies = readBehaviourPolicies(state);
  const pastePolicy = behaviourPolicies.paste;
  const pausedOnOrigin = pausedOriginsByMod(modFailureBudget);
  const sessionExceptions =
    dependencies.sessionExceptions ?? createSessionExceptionStore();
  const runtimePausedOrigins = state.runtimePausedOrigins ?? [];

  if (message.type === "list-mods") {
    const origin =
      message.url === undefined ? undefined : pageOrigin(message.url);
    return mods.map((mod) => ({
      manifest: mod.manifest,
      enabled: enabled[mod.manifest.id] ?? true,
      grants: grants[mod.manifest.id] ?? mod.manifest.capabilities.required,
      origin: mod.origin ?? "bundled",
      trustKind: classifyModTrust(mod),
      disabledOnOrigin:
        origin !== undefined &&
        (siteExceptions[mod.manifest.id] ?? []).includes(origin),
      pausedOnOrigin:
        origin !== undefined &&
        isModPausedOnOrigin(modFailureBudget, mod.manifest.id, origin),
      sessionExceptedOnOrigin:
        origin !== undefined &&
        isSessionExcepted(sessionExceptions.mods, mod.manifest.id, origin),
    }));
  }
  if (message.type === "get-popup-chrome") {
    const origin =
      message.url === undefined ? undefined : pageOrigin(message.url);
    return {
      pinHintDismissed: state.pinHintDismissed === true,
      runtimePaused: isOriginRuntimePaused(runtimePausedOrigins, origin),
    };
  }
  if (message.type === "dismiss-pin-hint") {
    await dependencies.setState({ pinHintDismissed: true });
    return { ok: true };
  }
  if (message.type === "get-paste-policy") {
    return behaviourPolicyResponse(
      pastePolicy,
      message.url,
      pageOrigin,
      sessionExceptions.policies.paste,
    );
  }
  if (message.type === "get-behaviour-policies") {
    return behaviourPoliciesResponse(
      behaviourPolicies,
      message.url,
      pageOrigin,
      sessionExceptions.policies,
    );
  }
  if (message.type === "list-activity") {
    return state.activity ?? [];
  }
  if (message.type === "activity-event" && isActivityEvent(message.event)) {
    await dependencies.setState({
      activity: appendActivityEvents(state.activity ?? [], {
        ...message.event,
        at: Date.now(),
      }),
    });
    return { ok: true };
  }
  if (message.type === "active-mods" && message.url !== undefined) {
    const selected = selectActiveMods(
      mods,
      message.url,
      enabled,
      grants,
      siteExceptions,
      pausedOnOrigin,
      sessionExceptions.mods,
      runtimePausedOrigins,
    );
    if (sender.tab?.id !== undefined) {
      dependencies.reportToolbar?.(
        sender.tab.id,
        message.url,
        selected.mods.length,
      );
    }
    return {
      ...(await attachCosmeticHides(
        selected,
        dependencies.readBrowserFilter,
      )),
      userscriptsAvailable: await probeUserScriptsAvailable(
        dependencies.userScripts,
      ),
    };
  }
  if (
    message.type === "set-enabled" &&
    message.modId !== undefined &&
    message.enabled !== undefined
  ) {
    const manifest = mods.find(
      (mod) => mod.manifest.id === message.modId,
    )?.manifest;
    if (manifest === undefined) {
      return { ok: false };
    }
    enabled[message.modId] = message.enabled;
    await syncModSideEffects(
      dependencies,
      mods,
      enabled,
      grants,
      syncSkips(siteExceptions, modFailureBudget, sessionExceptions.mods),
    );
    await dependencies.setState({ enabled });
    if (!message.enabled) {
      await reloadTabsWithActiveMod(message.modId, dependencies);
    }
    return { ok: true };
  }
  if (
    message.type === "set-capability" &&
    message.modId !== undefined &&
    message.capability !== undefined &&
    message.granted !== undefined
  ) {
    const manifest = mods.find(
      (mod) => mod.manifest.id === message.modId,
    )?.manifest;
    if (manifest === undefined) {
      return { ok: false };
    }
    grants[message.modId] = updateOptionalGrant(
      manifest,
      grants[message.modId] ?? [],
      message.capability,
      message.granted,
    );
    await syncModSideEffects(
      dependencies,
      mods,
      enabled,
      grants,
      syncSkips(siteExceptions, modFailureBudget, sessionExceptions.mods),
    );
    await dependencies.setState({ grants });
    return { ok: true };
  }
  if (
    message.type === "set-site-exception" &&
    message.modId !== undefined &&
    message.origin !== undefined &&
    message.excepted !== undefined
  ) {
    const manifest = mods.find(
      (mod) => mod.manifest.id === message.modId,
    )?.manifest;
    if (manifest === undefined || pageOrigin(message.origin) !== message.origin) {
      return { ok: false };
    }
    siteExceptions[message.modId] = updateSiteException(
      siteExceptions[message.modId],
      message.origin,
      message.excepted,
    );
    await syncModSideEffects(
      dependencies,
      mods,
      enabled,
      grants,
      syncSkips(siteExceptions, modFailureBudget, sessionExceptions.mods),
    );
    await dependencies.setState({ siteExceptions });
    if (message.excepted) {
      await reloadTabsWithActiveMod(message.modId, dependencies);
    }
    return { ok: true };
  }
  if (
    message.type === "set-session-exception" &&
    message.origin !== undefined &&
    message.excepted !== undefined
  ) {
    const origin = pageOrigin(message.origin);
    if (origin !== message.origin) {
      return { ok: false };
    }
    const hasMod = message.modId !== undefined;
    const hasPolicy = message.policy !== undefined;
    if (hasMod === hasPolicy) {
      return { ok: false };
    }
    if (hasMod) {
      const manifest = mods.find(
        (mod) => mod.manifest.id === message.modId,
      )?.manifest;
      if (manifest === undefined || message.modId === undefined) {
        return { ok: false };
      }
      setSessionOriginException(
        sessionExceptions.mods,
        message.modId,
        origin,
        message.excepted,
      );
      await syncModSideEffects(
        dependencies,
        mods,
        enabled,
        grants,
        syncSkips(siteExceptions, modFailureBudget, sessionExceptions.mods),
      );
      if (message.excepted) {
        await reloadTabsWithActiveMod(message.modId, dependencies);
      }
      return { ok: true };
    }
    if (!isBehaviourPolicyId(message.policy)) {
      return { ok: false };
    }
    setSessionOriginException(
      sessionExceptions.policies,
      message.policy,
      origin,
      message.excepted,
    );
    await notifyBehaviourPolicyTabs(dependencies, message.policy);
    return { ok: true };
  }
  if (
    (message.type === "record-mod-failure" ||
      message.type === "record-mod-success") &&
    message.modId !== undefined &&
    message.origin !== undefined
  ) {
    const manifest = mods.find(
      (mod) => mod.manifest.id === message.modId,
    )?.manifest;
    const origin = originFromPageUrl(message.origin);
    if (manifest === undefined || origin !== message.origin) {
      return { ok: false };
    }
    const previousPaused = isModPausedOnOrigin(
      modFailureBudget,
      message.modId,
      origin,
    );
    modFailureBudget =
      message.type === "record-mod-failure"
        ? recordModFailure(modFailureBudget, message.modId, origin)
        : recordModSuccess(modFailureBudget, message.modId, origin);
    await dependencies.setState({ modFailureBudget });
    const nowPaused = isModPausedOnOrigin(
      modFailureBudget,
      message.modId,
      origin,
    );
    if (nowPaused !== previousPaused) {
      await syncModSideEffects(
        dependencies,
        mods,
        enabled,
        grants,
        syncSkips(siteExceptions, modFailureBudget, sessionExceptions.mods),
      );
      if (nowPaused) {
        await reloadTabsWithActiveMod(message.modId, dependencies);
      }
    }
    return { ok: true, paused: nowPaused };
  }
  if (
    message.type === "set-mod-pause" &&
    message.modId !== undefined &&
    message.origin !== undefined &&
    message.paused !== undefined
  ) {
    const manifest = mods.find(
      (mod) => mod.manifest.id === message.modId,
    )?.manifest;
    const origin = originFromPageUrl(message.origin);
    if (manifest === undefined || origin !== message.origin) {
      return { ok: false };
    }
    modFailureBudget = setModPausedOnOrigin(
      modFailureBudget,
      message.modId,
      origin,
      message.paused,
    );
    await syncModSideEffects(
      dependencies,
      mods,
      enabled,
      grants,
      syncSkips(siteExceptions, modFailureBudget, sessionExceptions.mods),
    );
    await dependencies.setState({ modFailureBudget });
    if (message.paused) {
      await reloadTabsWithActiveMod(message.modId, dependencies);
    }
    return { ok: true };
  }
  if (message.type === "set-paste-policy") {
    return persistBehaviourPolicy(
      dependencies,
      "paste",
      updatePastePolicy(pastePolicy, policyChange(message)),
    );
  }
  if (message.type === "set-behaviour-policy") {
    if (!isBehaviourPolicyId(message.policy)) {
      return { ok: false };
    }
    return persistBehaviourPolicy(
      dependencies,
      message.policy,
      updateOriginDenyPolicy(
        behaviourPolicies[message.policy],
        policyChange(message),
      ),
    );
  }
  if (
    message.type === "reddit-comments-search" &&
    message.modId !== undefined &&
    message.query !== undefined
  ) {
    const manifest = mods.find(
      (mod) => mod.manifest.id === message.modId,
    )?.manifest;
    if (
      manifest === undefined ||
      enabled[message.modId] === false ||
      !manifest.capabilities.optional?.includes("reddit.comments.search") ||
      !grants[message.modId]?.includes("reddit.comments.search") ||
      dependencies.fetchRedditHtml === undefined
    ) {
      return { status: 403, error: "Reddit comments denied" };
    }
    return parseRedditComments(
      await dependencies.fetchRedditHtml(message.query),
      parseRedditDocument,
    );
  }
  if (
    message.type === "youtube-watch-sponsor-segments" &&
    message.modId !== undefined &&
    message.videoId !== undefined
  ) {
    const manifest = mods.find(
      (mod) => mod.manifest.id === message.modId,
    )?.manifest;
    const declared =
      manifest?.capabilities.required.includes(
        "youtube.watch.sponsorSegments",
      ) === true ||
      manifest?.capabilities.optional?.includes(
        "youtube.watch.sponsorSegments",
      ) === true;
    if (
      manifest === undefined ||
      enabled[message.modId] === false ||
      !declared ||
      !grants[message.modId]?.includes("youtube.watch.sponsorSegments") ||
      dependencies.fetchSponsorSegmentsJson === undefined
    ) {
      return { status: 403, error: "SponsorBlock search denied" };
    }
    return parseSponsorSegments(
      await dependencies.fetchSponsorSegmentsJson(message.videoId),
    );
  }
  if (
    message.type === "network-request" &&
    message.modId !== undefined &&
    message.contractId !== undefined
  ) {
    return handleBrokerRequest(
      mods,
      enabled,
      grants,
      message.modId,
      message.contractId,
    );
  }
  if (message.type === "import-mod" && message.archive !== undefined) {
    try {
      const imported = installedModFromPackedArchive(
        decodeArchiveFromStorage(message.archive),
        "import.prism",
      );
      mergeInstalledMods(bundled, [imported]);
      const importedArchives = {
        ...state.importedArchives,
        [imported.manifest.id]: message.archive,
      };
      const nextMods = resolveInstalledMods(bundled, { importedArchives });
      await syncModSideEffects(
        dependencies,
        nextMods,
        enabled,
        grants,
        syncSkips(siteExceptions, modFailureBudget, sessionExceptions.mods),
      );
      await dependencies.setState({ importedArchives });
      return { ok: true, id: imported.manifest.id };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Package failed policy inspection",
      };
    }
  }
  if (message.type === "get-element-hides") {
    const origin =
      message.url === undefined ? undefined : pageOrigin(message.url);
    return {
      selectors:
        origin === undefined
          ? []
          : (state.elementHides?.[origin] ?? []),
    };
  }
  if (
    message.type === "add-element-hide" &&
    message.origin !== undefined &&
    message.selector !== undefined
  ) {
    if (hideRuleCss(message.selector) === undefined) {
      return { ok: false };
    }
    const elementHides = { ...state.elementHides };
    elementHides[message.origin] = updateOriginHideSelectors(
      elementHides[message.origin],
      message.selector,
      true,
    );
    await dependencies.setState({ elementHides });
    return { ok: true };
  }
  if (
    message.type === "set-runtime-pause" &&
    message.origin !== undefined &&
    message.paused !== undefined
  ) {
    await dependencies.setState({
      [RUNTIME_PAUSED_ORIGINS_KEY]: updateRuntimePausedOrigins(
        runtimePausedOrigins,
        message.origin,
        message.paused,
      ),
    });
    return { ok: true };
  }
  if (message.type === "report-runtime-pause" && message.origin !== undefined) {
    await dependencies.setState({
      [RUNTIME_PAUSED_ORIGINS_KEY]: updateRuntimePausedOrigins(
        runtimePausedOrigins,
        message.origin,
        true,
      ),
    });
    return { ok: true };
  }
  const requestedTabId = message.tabId ?? sender.tab?.id;
  if (message.type === "undo-last" && requestedTabId !== undefined) {
    return forwardUndoToTab(
      dependencies.sendToTab,
      requestedTabId,
    );
  }
  return { ok: false };
}

const EXTENSION_MESSAGE_TYPES = new Set([
  "active-mods",
  "activity-event",
  "add-element-hide",
  "dismiss-pin-hint",
  "get-behaviour-policies",
  "get-element-hides",
  "get-paste-policy",
  "get-popup-chrome",
  "import-mod",
  "list-activity",
  "list-mods",
  "network-request",
  "record-mod-failure",
  "record-mod-success",
  "report-runtime-pause",
  "reddit-comments-search",
  "youtube-watch-sponsor-segments",
  "set-behaviour-policy",
  "set-capability",
  "set-enabled",
  "set-mod-pause",
  "set-paste-policy",
  "set-runtime-pause",
  "set-site-exception",
  "set-session-exception",
  "undo-last",
]);
const POPUP_ONLY_MESSAGE_TYPES = new Set([
  "dismiss-pin-hint",
  "import-mod",
  "set-behaviour-policy",
  "set-capability",
  "set-enabled",
  "set-mod-pause",
  "set-paste-policy",
  "set-runtime-pause",
  "set-site-exception",
  "set-session-exception",
]);

export function isAuthorisedRuntimeMessage(
  message: RuntimeMessage,
  sender: RuntimeMessageSender,
  authentication: RuntimeMessageAuthentication,
): boolean {
  if (
    !EXTENSION_MESSAGE_TYPES.has(message.type) ||
    sender.id !== authentication.extensionId
  ) {
    return false;
  }
  if (!POPUP_ONLY_MESSAGE_TYPES.has(message.type)) {
    return true;
  }
  return sender.url === authentication.popupUrl;
}

function syncSkips(
  siteExceptions: Readonly<Record<string, readonly string[]>>,
  budget: ModFailureBudgetState | undefined,
  sessionMods: Readonly<Record<string, readonly string[]>> = {},
): Record<string, string[]> {
  return mergeOriginExclusions(
    mergeOriginExclusions(siteExceptions, pausedOriginsByMod(budget)),
    sessionMods,
  );
}

function resolveInstalledMods(
  bundled: readonly BundledMod[],
  state: StoredState,
): BundledMod[] {
  return mergeInstalledMods(
    bundled,
    loadImportedModsFromStorage(state.importedArchives),
  );
}

async function attachCosmeticHides(
  selected: ReturnType<typeof selectActiveMods>,
  readFilter: ReadBrowserFilter | undefined,
): Promise<ReturnType<typeof selectActiveMods>> {
  if (readFilter === undefined) {
    return selected;
  }
  return {
    mods: await Promise.all(
      selected.mods.map(async (mod) => {
        if (
          !mod.grants.includes("network.browser.block") ||
          (mod.manifest.filters?.browser ?? []).length === 0
        ) {
          return mod;
        }
        const lists: string[] = [];
        for (const path of mod.manifest.filters?.browser ?? []) {
          lists.push(await readFilter(mod.manifest.id, path));
        }
        const cosmetics = compileCosmeticFilters(lists);
        return cosmetics.length === 0 ? mod : { ...mod, cosmetics };
      }),
    ),
  };
}

function policyChange(message: RuntimeMessage): {
  readonly default?: boolean;
  readonly origin?: string;
  readonly deny?: boolean;
} {
  return {
    ...(message.default === undefined ? {} : { default: message.default }),
    ...(message.origin === undefined ? {} : { origin: message.origin }),
    ...(message.deny === undefined ? {} : { deny: message.deny }),
  };
}

async function persistBehaviourPolicy(
  dependencies: ServiceWorkerDependencies,
  policy: BehaviourPolicyId,
  next: OriginDenyPolicyState | undefined,
): Promise<{ readonly ok: boolean }> {
  if (next === undefined) {
    return { ok: false };
  }
  const stored: StoredState = {};
  stored[BEHAVIOUR_POLICY_STORAGE_KEYS[policy]] = next;
  await dependencies.setState(stored);
  await notifyBehaviourPolicyTabs(dependencies, policy);
  return { ok: true };
}

async function notifyBehaviourPolicyTabs(
  dependencies: ServiceWorkerDependencies,
  policy: BehaviourPolicyId,
): Promise<void> {
  const tabs = await dependencies.queryTabs();
  await Promise.all(
    tabs.map(async ({ id }) => {
      if (id === undefined) {
        return;
      }
      try {
        if (policy === "paste") {
          await dependencies.sendToTab(id, { type: "paste-policy" });
        }
        await dependencies.sendToTab(id, { type: "behaviour-policies" });
      } catch {
        // Tabs without the Prism content script have no behaviour guards.
      }
    }),
  );
}

async function reloadTabsWithActiveMod(
  modId: string,
  dependencies: ServiceWorkerDependencies,
): Promise<void> {
  const tabs = await dependencies.queryTabs();
  await Promise.all(
    tabs.map(async ({ id }) => {
      if (id === undefined) {
        return;
      }
      try {
        const response = await dependencies.sendToTab(id, {
          type: "is-mod-active",
          modId,
        });
        if (isRecord(response) && response.active === true) {
          await dependencies.reloadTab(id);
        }
      } catch {
        // Tabs without the Prism content script cannot have an active mod.
      }
    }),
  );
}

export function handleBrokerRequest(
  mods: readonly BundledMod[],
  enabled: Readonly<Record<string, boolean>>,
  grants: Readonly<Record<string, readonly string[]>>,
  modId: string,
  contractId: string,
): BrokeredResponse {
  const manifest = mods.find((mod) => mod.manifest.id === modId)?.manifest;
  const contract = manifest?.egress?.contracts.find(
    (entry) => entry.id === contractId,
  );
  if (
    manifest === undefined ||
    enabled[modId] === false ||
    !grants[modId]?.includes("network.egress") ||
    contract === undefined
  ) {
    return {
      status: 403,
      fields: { error: "Network request denied" },
    };
  }
  return {
    status: 503,
    fields: { error: "Network broker unavailable" },
  };
}

function createChromeDependencies(): ServiceWorkerDependencies {
  return {
    getState: () =>
      chrome.storage.local.get([
        "enabled",
        "grants",
        "importedArchives",
        "activity",
        "siteExceptions",
        RUNTIME_PAUSED_ORIGINS_KEY,
        "elementHides",
        "pinHintDismissed",
        MOD_FAILURE_BUDGET_STORAGE_KEY,
        PASTE_POLICY_STORAGE_KEY,
        ...Object.values(BEHAVIOUR_POLICY_STORAGE_KEYS),
      ]),
    setState: (state) => chrome.storage.local.set(state),
    sendToTab: (tabId, message) =>
      chrome.tabs.sendMessage(tabId, message),
    queryTabs: () => chrome.tabs.query({}),
    reloadTab: (tabId) => chrome.tabs.reload(tabId),
    sessionExceptions: createSessionExceptionStore(),
    reportToolbar: (tabId, url, enabledCount) => {
      const action = (
        chrome as unknown as {
          action?: {
            setBadgeText(details: { tabId?: number; text: string }): void;
            setTitle(details: { tabId?: number; title: string }): void;
          };
        }
      ).action;
      if (action === undefined) {
        return;
      }
      const injectable = isInjectablePageUrl(url);
      const text = injectable ? toolbarBadgeText(enabledCount) : "";
      const title = toolbarTitle({
        injectable,
        enabledOnTab: injectable ? enabledCount : 0,
      });
      action.setBadgeText({ tabId, text });
      action.setTitle({ tabId, title });
    },
    syncBrowserRules: (mods, enabled, grants, siteExceptions) =>
      syncBrowserBlockRules(
        mods,
        enabled,
        grants,
        readBundledBrowserFilter,
        chrome.declarativeNetRequest,
        siteExceptions ?? {},
      ),
    readBrowserFilter: readBundledBrowserFilter,
    fetchRedditHtml: fetchRedditCommentsHtml,
    fetchSponsorSegmentsJson: fetchSponsorSkipSegmentsJson,
    userScripts: chrome.userScripts,
  };
}

async function fetchRedditCommentsHtml(query: string): Promise<string> {
  const response = await fetch(createRedditCommentSearchUrl(query), {
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`Reddit comment search failed: ${response.status}`);
  }
  return response.text();
}

async function fetchSponsorSkipSegmentsJson(videoId: string): Promise<string> {
  const response = await fetch(createSponsorSkipSegmentsUrl(videoId), {
    credentials: "omit",
  });
  if (response.status === 404) {
    return "[]";
  }
  if (!response.ok) {
    throw new Error(`SponsorBlock skipSegments failed: ${response.status}`);
  }
  return response.text();
}

function parseRedditDocument(html: string): Document {
  return new DOMParser().parseFromString(
    html,
    "text/html",
  ) as unknown as Document;
}

async function readBundledBrowserFilter(
  modId: string,
  path: string,
): Promise<string> {
  const state = await chrome.storage.local.get(["importedArchives"]);
  const imported = loadImportedModsFromStorage(
    state.importedArchives,
  ).find((mod) => mod.manifest.id === modId);
  const bytes = imported?.files?.[path];
  if (bytes !== undefined) {
    return new TextDecoder().decode(bytes);
  }
  const response = await fetch(
    chrome.runtime.getURL(
      `bundled-mods/${encodeURIComponent(modId)}/${path}`,
    ),
  );
  if (!response.ok) {
    throw new Error(
      `Could not load browser filter for ${modId}: ${response.status}`,
    );
  }
  return response.text();
}

export async function syncRegisteredUserScripts(
  mods: readonly BundledMod[],
  enabled: Readonly<Record<string, boolean>>,
  api: UserScriptsApi | undefined,
): Promise<boolean> {
  const available = await probeUserScriptsAvailable(api);
  if (!available || api === undefined) {
    return false;
  }
  try {
    await api.unregister();
    const scripts = userscriptRegistrations(mods, enabled);
    if (scripts.length > 0) {
      await api.register(scripts);
    }
    return true;
  } catch {
    return false;
  }
}

async function syncModSideEffects(
  dependencies: ServiceWorkerDependencies,
  mods: readonly BundledMod[],
  enabled: Readonly<Record<string, boolean>>,
  grants: Readonly<Record<string, readonly string[]>>,
  siteExceptions: Readonly<Record<string, readonly string[]>>,
): Promise<void> {
  await dependencies.syncBrowserRules(mods, enabled, grants, siteExceptions);
  await syncRegisteredUserScripts(mods, enabled, dependencies.userScripts);
}

async function syncInitialBrowserRules(
  modsPromise: Promise<BundledMod[]>,
  dependencies: ServiceWorkerDependencies,
): Promise<void> {
  const [mods, state] = await Promise.all([
    modsPromise,
    dependencies.getState(),
  ]);
  const enabled = state.enabled ?? {};
  const grants = state.grants ?? {};
  const siteExceptions = state.siteExceptions ?? {};
  await syncModSideEffects(
    dependencies,
    resolveInstalledMods(mods, state),
    enabled,
    grants,
    syncSkips(
      siteExceptions,
      state.modFailureBudget,
      dependencies.sessionExceptions?.mods,
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
