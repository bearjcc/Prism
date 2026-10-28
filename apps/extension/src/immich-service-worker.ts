import {
  IMMICH_UI_SETTINGS_KEY,
  IMMICH_OPTIONS_HASH,
  type ContextMenusApi,
  immichPageUiPlan,
  readImmichUiSettings,
  syncImmichContextMenu,
  type ImmichUploadDependencies,
} from "./immich-upload-handler.js";
import {
  IMMICH_CAPABILITY,
  IMMICH_CONFIG_STORAGE_KEY,
  IMMICH_MOD_ID,
  immichModActive,
  isImmichConfigured,
  readImmichConfig,
  sanitizeImmichConfigInput,
  testImmichConnection,
} from "./immich-upload.js";
import { extensionContextMenusSupported } from "./immich-mobile-chip.js";
import type { StoredState } from "./service-worker.js";

export function immichStorageKeys(): string[] {
  return [IMMICH_CONFIG_STORAGE_KEY, IMMICH_UI_SETTINGS_KEY];
}

export async function refreshImmichContextMenu(
  contextMenus: ContextMenusApi | undefined,
  state: StoredState,
  enabled: Readonly<Record<string, boolean>>,
  grants: Readonly<Record<string, readonly string[]>>,
  userAgent: string,
): Promise<void> {
  const config = readImmichConfig(state as Record<string, unknown>);
  await syncImmichContextMenu(
    contextMenus,
    immichModActive(enabled[IMMICH_MOD_ID], grants[IMMICH_MOD_ID]),
    isImmichConfigured(config),
    readImmichUiSettings(state as Record<string, unknown>),
    userAgent,
  );
}

export function buildImmichPageUiResponse(
  state: StoredState,
  enabled: Readonly<Record<string, boolean>>,
  grants: Readonly<Record<string, readonly string[]>>,
  userAgent: string,
  touchCapable: boolean,
  contextMenusSupported: boolean,
): Readonly<{ modActive: boolean; useMobileChip: boolean }> {
  const modActive = immichModActive(enabled[IMMICH_MOD_ID], grants[IMMICH_MOD_ID]);
  const plan = immichPageUiPlan({
    modActive,
    ui: readImmichUiSettings(state as Record<string, unknown>),
    userAgent,
    contextMenusSupported,
    touchCapable,
  });
  return { modActive, useMobileChip: plan.useMobileChip };
}

export function createImmichUploadDependencies(
  base: Readonly<{
    getState: () => Promise<StoredState>;
    setState: (state: StoredState) => Promise<void>;
    sendToTab: (tabId: number, message: unknown) => Promise<unknown>;
    requestHostPermission?: (originPattern: string) => Promise<boolean>;
    showNotification?: (title: string, message: string) => void;
    openOptions?: (hash: string) => void;
  }>,
): ImmichUploadDependencies {
  return {
    fetch: (...args) => fetch(...args),
    getState: () => base.getState() as Promise<Record<string, unknown>>,
    setState: (state) => base.setState(state as StoredState),
    sendToTab: base.sendToTab,
    requestHostPermission: base.requestHostPermission,
    showNotification: base.showNotification,
    openOptions: base.openOptions,
  };
}

export async function handleImmichConfigMessage(
  message: Readonly<{
    serverUrl?: string;
    apiKey?: string;
    mobileChip?: boolean;
  }>,
  state: StoredState,
  setState: (state: StoredState) => Promise<void>,
  requestHostPermission?: (originPattern: string) => Promise<boolean>,
): Promise<unknown> {
  const previous = readImmichConfig(state as Record<string, unknown>);
  if (message.serverUrl !== undefined || message.apiKey !== undefined) {
    const next = sanitizeImmichConfigInput(
      {
        serverUrl: message.serverUrl ?? previous?.serverUrl ?? "",
        apiKey: message.apiKey ?? "",
      },
      previous,
    );
    if (next === undefined) {
      return { ok: false, error: "Invalid Immich settings" };
    }
    const pattern = `${new URL(next.serverUrl).origin}/*`;
    if (
      requestHostPermission !== undefined &&
      !(await requestHostPermission(pattern))
    ) {
      return { ok: false, error: "Immich host permission denied" };
    }
    await setState({
      [IMMICH_CONFIG_STORAGE_KEY]: next,
    });
  }
  if (typeof message.mobileChip === "boolean") {
    await setState({
      [IMMICH_UI_SETTINGS_KEY]: {
        ...readImmichUiSettings(state as Record<string, unknown>),
        mobileChip: message.mobileChip,
      },
    });
  }
  return { ok: true };
}

export async function handleImmichTestConnection(
  message: Readonly<{ serverUrl?: string; apiKey?: string }>,
  state: StoredState,
  requestHostPermission?: (originPattern: string) => Promise<boolean>,
): Promise<unknown> {
  const previous = readImmichConfig(state as Record<string, unknown>);
  const config = sanitizeImmichConfigInput(
    {
      serverUrl: message.serverUrl ?? previous?.serverUrl ?? "",
      apiKey: message.apiKey ?? "",
    },
    previous,
  );
  if (config === undefined) {
    return { ok: false, result: { outcome: "failed", reason: "not-configured" } };
  }
  const pattern = `${new URL(config.serverUrl).origin}/*`;
  if (
    requestHostPermission !== undefined &&
    !(await requestHostPermission(pattern))
  ) {
    return { ok: false, result: { outcome: "failed", reason: "unreachable" } };
  }
  const result = await testImmichConnection(fetch, config);
  return { ok: result.outcome === "success", result };
}

export function immichPublicConfigView(state: StoredState): Readonly<{
  serverUrl: string;
  hasApiKey: boolean;
  configured: boolean;
  mobileChip: boolean | undefined;
}> {
  const config = readImmichConfig(state as Record<string, unknown>);
  const ui = readImmichUiSettings(state as Record<string, unknown>);
  return {
    serverUrl: config?.serverUrl ?? "",
    hasApiKey: config?.apiKey !== undefined && config.apiKey !== "",
    configured: isImmichConfigured(config),
    mobileChip: ui.mobileChip,
  };
}

export function readContextMenusApi(
  chromeLike: unknown,
): ContextMenusApi | undefined {
  const candidate = chromeLike as { contextMenus?: ContextMenusApi };
  return extensionContextMenusSupported(candidate.contextMenus)
    ? candidate.contextMenus
    : undefined;
}

export { IMMICH_CAPABILITY, IMMICH_MOD_ID, IMMICH_OPTIONS_HASH };
