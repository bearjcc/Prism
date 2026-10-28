import {
  CONTEXT_MENU_IMMICH_UPLOAD,
  CONTEXT_MENU_PRISM_ROOT,
} from "./context-menu.js";
import type { ActivityEvent, StoredActivityEvent } from "./gate.js";
import { appendActivityEvents } from "./gate.js";
import {
  IMMICH_MOD_ID,
  IMMICH_UPLOAD_ACTION,
  type ImmichUploadResult,
  type ResolvedImagePayload,
  fetchImageInBackground,
  hostPermissionPatternForUrl,
  immichHostPermissionPattern,
  isImmichConfigured,
  notificationBodyForResult,
  readImmichConfig,
  shouldRegisterImmichContextMenu,
  uploadToImmich,
} from "./immich-upload.js";
import {
  detectTouchCapable,
  extensionContextMenusSupported,
  preferImmichMobileChip,
} from "./immich-mobile-chip.js";

export type ImmichUploadRequest = Readonly<{
  srcUrl: string;
  pageOrigin: string;
  tabId: number;
  contextElement?: Element | null;
}>;

export type ImmichUploadDependencies = Readonly<{
  fetch: typeof fetch;
  getState: () => Promise<Record<string, unknown>>;
  setState: (state: Record<string, unknown>) => Promise<void>;
  sendToTab: (tabId: number, message: unknown) => Promise<unknown>;
  requestHostPermission?: (originPattern: string) => Promise<boolean>;
  showNotification?: (title: string, message: string) => void;
  openOptions?: (hash: string) => void;
  randomId?: () => string;
}>;

export async function requestImmichHostAccess(
  serverUrl: string,
  requestHostPermission: ((originPattern: string) => Promise<boolean>) | undefined,
): Promise<boolean> {
  const pattern = immichHostPermissionPattern(serverUrl);
  if (pattern === undefined || requestHostPermission === undefined) {
    return pattern === undefined ? false : true;
  }
  return requestHostPermission(pattern);
}

export async function resolveImmichImageBytes(
  deps: ImmichUploadDependencies,
  request: ImmichUploadRequest,
): Promise<ResolvedImagePayload | undefined> {
  let image = await fetchImageInBackground(deps.fetch, request.srcUrl);
  if (image !== undefined) {
    return image;
  }
  const imagePattern = hostPermissionPatternForUrl(request.srcUrl);
  if (
    imagePattern !== undefined &&
    deps.requestHostPermission !== undefined &&
    (await deps.requestHostPermission(imagePattern))
  ) {
    image = await fetchImageInBackground(deps.fetch, request.srcUrl);
    if (image !== undefined) {
      return image;
    }
  }
  try {
    const response = (await deps.sendToTab(request.tabId, {
      type: "immich-resolve-image",
      srcUrl: request.srcUrl,
    })) as
      | {
          readonly ok?: boolean;
          readonly bytes?: ArrayBuffer;
          readonly mimeType?: string;
          readonly filename?: string;
        }
      | undefined;
    if (
      response?.ok !== true ||
      response.bytes === undefined ||
      typeof response.mimeType !== "string" ||
      typeof response.filename !== "string"
    ) {
      return undefined;
    }
    return {
      bytes: new Uint8Array(response.bytes),
      mimeType: response.mimeType,
      filename: response.filename,
    };
  } catch {
    return undefined;
  }
}

export async function runImmichUpload(
  deps: ImmichUploadDependencies,
  request: ImmichUploadRequest,
): Promise<ImmichUploadResult> {
  const state = await deps.getState();
  const config = readImmichConfig(state);
  if (!isImmichConfigured(config)) {
    deps.openOptions?.("immich-setup");
    return { outcome: "failed", reason: "not-configured" };
  }
  const hostOk = await requestImmichHostAccess(
    config.serverUrl,
    deps.requestHostPermission,
  );
  if (!hostOk) {
    return { outcome: "failed", reason: "unreachable" };
  }
  const image = await resolveImmichImageBytes(deps, request);
  if (image === undefined) {
    return { outcome: "failed", reason: "no-image" };
  }
  const deviceAssetId = deps.randomId?.() ?? crypto.randomUUID();
  return uploadToImmich(deps.fetch, config, image, deviceAssetId);
}

export function immichModActionEvent(
  result: ImmichUploadResult,
  pageOrigin: string,
): ActivityEvent {
  return {
    layer: "mod-action",
    modId: IMMICH_MOD_ID,
    action: IMMICH_UPLOAD_ACTION,
    outcome: result.outcome,
    pageOrigin,
    detail: result.reason,
  };
}

export async function recordImmichUploadActivity(
  deps: Pick<ImmichUploadDependencies, "getState" | "setState">,
  result: ImmichUploadResult,
  pageOrigin: string,
): Promise<void> {
  const state = await deps.getState();
  const activity = (state.activity ?? []) as StoredActivityEvent[];
  const event = immichModActionEvent(result, pageOrigin);
  await deps.setState({
    activity: appendActivityEvents(activity, { ...event, at: Date.now() }),
  });
}

export async function performImmichUploadWithFeedback(
  deps: ImmichUploadDependencies,
  request: ImmichUploadRequest,
): Promise<ImmichUploadResult> {
  const result = await runImmichUpload(deps, request);
  await recordImmichUploadActivity(deps, result, request.pageOrigin);
  const title =
    result.outcome === "success"
      ? "Immich upload"
      : result.outcome === "duplicate"
        ? "Immich duplicate"
        : "Immich upload failed";
  deps.showNotification?.(title, notificationBodyForResult(result));
  return result;
}

export function immichContextMenuTitle(configured: boolean): string {
  return configured ? "Upload to Immich" : "Set up Immich upload";
}

export const IMMICH_OPTIONS_HASH = "immich-setup";

export function immichContextMenuClickInfo(
  menuItemId: string | number,
): menuItemId is typeof CONTEXT_MENU_IMMICH_UPLOAD {
  return menuItemId === CONTEXT_MENU_IMMICH_UPLOAD;
}

export type ImmichUiSettings = Readonly<{
  mobileChip?: boolean;
}>;

export const IMMICH_UI_SETTINGS_KEY = "immichUploadUi";

export function readImmichUiSettings(
  state: Record<string, unknown>,
): ImmichUiSettings {
  const raw = state[IMMICH_UI_SETTINGS_KEY];
  if (!isRecord(raw)) {
    return {};
  }
  return {
    ...(typeof raw.mobileChip === "boolean"
      ? { mobileChip: raw.mobileChip }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ContextMenusApi = Readonly<{
  create(details: {
    id: string;
    title: string;
    contexts: string[];
    parentId?: string;
  }): void;
  remove(menuItemId: string): void | Promise<void>;
}>;

export async function syncImmichContextMenu(
  contextMenus: ContextMenusApi | undefined,
  modActive: boolean,
  configured: boolean,
  ui: ImmichUiSettings,
  userAgent: string,
): Promise<void> {
  if (contextMenus === undefined) {
    return;
  }
  const supported = extensionContextMenusSupported(contextMenus);
  const register = shouldRegisterImmichContextMenu({
    userAgent,
    mobileChipSetting: ui.mobileChip,
    contextMenusSupported: supported,
  });
  if (!modActive || !register) {
    try {
      await contextMenus.remove(CONTEXT_MENU_IMMICH_UPLOAD);
    } catch {
      // Item may not exist.
    }
    return;
  }
  contextMenus.create({
    id: CONTEXT_MENU_IMMICH_UPLOAD,
    parentId: CONTEXT_MENU_PRISM_ROOT,
    title: immichContextMenuTitle(configured),
    contexts: ["image"],
  });
}

export function immichPageUiPlan(options: Readonly<{
  modActive: boolean;
  ui: ImmichUiSettings;
  userAgent: string;
  contextMenusSupported: boolean;
  touchCapable: boolean;
}>): Readonly<{ useMobileChip: boolean; registerContextMenu: boolean }> {
  const useMobileChip =
    options.modActive &&
    preferImmichMobileChip({
      touchCapable: options.touchCapable,
      contextMenusSupported: options.contextMenusSupported,
      mobileChipSetting: options.ui.mobileChip,
    });
  const registerContextMenu =
    options.modActive &&
    shouldRegisterImmichContextMenu({
      userAgent: options.userAgent,
      mobileChipSetting: options.ui.mobileChip,
      contextMenusSupported: options.contextMenusSupported,
    });
  return { useMobileChip, registerContextMenu };
}

export function readImmichPageUiFromEnvironment(global: Readonly<{
  navigator: { userAgent: string };
  matchMedia?(query: string): MediaQueryList;
  ontouchstart?: unknown;
}>): Pick<
  ReturnType<typeof immichPageUiPlan>,
  "useMobileChip" | "registerContextMenu"
> & { touchCapable: boolean; contextMenusSupported: boolean } {
  const touchCapable = detectTouchCapable(global);
  return {
    touchCapable,
    contextMenusSupported: true,
    ...immichPageUiPlan({
      modActive: true,
      ui: {},
      userAgent: global.navigator.userAgent,
      contextMenusSupported: true,
      touchCapable,
    }),
  };
}
