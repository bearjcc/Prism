import type { CapabilityId } from "@prism/schema";

export const IMMICH_MOD_ID = "prism.immich-upload";
export const IMMICH_CAPABILITY = "media.immich.contextUpload" satisfies CapabilityId;
export const IMMICH_CONFIG_STORAGE_KEY = "immichUploadConfig";
export const IMMICH_DEVICE_ID = "prism-extension";
export const IMMICH_UPLOAD_ACTION = "immich-upload";

/** Max bytes for a single upload (50 MiB). */
export const IMMICH_MAX_BYTES = 50 * 1024 * 1024;

export type ImmichUploadConfig = Readonly<{
  serverUrl: string;
  apiKey: string;
}>;

export type ImmichUploadOutcome = "success" | "duplicate" | "failed";

export type ImmichUploadResult = Readonly<{
  outcome: ImmichUploadOutcome;
  reason: string;
}>;

export type ResolvedImagePayload = Readonly<{
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
}>;

export function normalizeImmichServerUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
    return parsed.toString().replace(/\/+$/u, "");
  } catch {
    return undefined;
  }
}

export function immichApiBase(serverUrl: string): string {
  const base = normalizeImmichServerUrl(serverUrl);
  if (base === undefined) {
    throw new Error("Invalid Immich server URL");
  }
  return `${base}/api`;
}

export function hostPermissionPatternForUrl(raw: string): string | undefined {
  if (raw.startsWith("data:") || raw.startsWith("blob:")) {
    return undefined;
  }
  try {
    return `${new URL(raw).origin}/*`;
  } catch {
    return undefined;
  }
}

export function shouldRegisterImmichContextMenu(options: Readonly<{
  userAgent: string;
  mobileChipSetting: boolean | undefined;
  contextMenusSupported: boolean;
}>): boolean {
  if (!options.contextMenusSupported) {
    return false;
  }
  if (options.mobileChipSetting === true) {
    return false;
  }
  if (options.mobileChipSetting === false) {
    return true;
  }
  if (/Android/i.test(options.userAgent)) {
    return false;
  }
  return true;
}

export function immichHostPermissionPattern(serverUrl: string): string | undefined {
  const normalized = normalizeImmichServerUrl(serverUrl);
  if (normalized === undefined) {
    return undefined;
  }
  return `${new URL(normalized).origin}/*`;
}

export function isImmichConfigured(
  config: Partial<ImmichUploadConfig> | undefined,
): config is ImmichUploadConfig {
  return (
    config !== undefined &&
    normalizeImmichServerUrl(config.serverUrl ?? "") !== undefined &&
    typeof config.apiKey === "string" &&
    config.apiKey.trim() !== ""
  );
}

export function sanitizeImmichConfigInput(
  input: Partial<ImmichUploadConfig>,
  previous: ImmichUploadConfig | undefined,
): ImmichUploadConfig | undefined {
  const serverUrl = normalizeImmichServerUrl(input.serverUrl ?? "");
  if (serverUrl === undefined) {
    return undefined;
  }
  const apiKey =
    typeof input.apiKey === "string" && input.apiKey.trim() !== ""
      ? input.apiKey.trim()
      : previous?.apiKey;
  if (apiKey === undefined || apiKey.trim() === "") {
    return undefined;
  }
  return { serverUrl, apiKey: apiKey.trim() };
}

export function readImmichConfig(
  state: Record<string, unknown>,
): ImmichUploadConfig | undefined {
  const raw = state[IMMICH_CONFIG_STORAGE_KEY];
  if (!isRecord(raw)) {
    return undefined;
  }
  const serverUrl = normalizeImmichServerUrl(String(raw.serverUrl ?? ""));
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  if (serverUrl === undefined || apiKey === "") {
    return undefined;
  }
  return { serverUrl, apiKey };
}

export async function testImmichConnection(
  fetchImpl: typeof fetch,
  config: ImmichUploadConfig,
): Promise<ImmichUploadResult> {
  const apiBase = immichApiBase(config.serverUrl);
  try {
    const response = await fetchImpl(`${apiBase}/server/ping`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": config.apiKey,
      },
      credentials: "omit",
    });
    if (response.status === 401 || response.status === 403) {
      return { outcome: "failed", reason: "bad-key" };
    }
    if (!response.ok) {
      return { outcome: "failed", reason: "unreachable" };
    }
    return { outcome: "success", reason: "connected" };
  } catch {
    return { outcome: "failed", reason: "network-error" };
  }
}

export function parseDataUrl(srcUrl: string): ResolvedImagePayload | undefined {
  const match = /^data:([^;,]+)?;base64,(.+)$/u.exec(srcUrl);
  if (match === null) {
    return undefined;
  }
  const mimeType = match[1]?.trim() !== "" ? match[1]!.trim() : "application/octet-stream";
  if (!mimeType.toLowerCase().startsWith("image/")) {
    return undefined;
  }
  try {
    const binary = atob(match[2]!);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return {
      bytes,
      mimeType,
      filename: extensionForMime(mimeType),
    };
  } catch {
    return undefined;
  }
}

export function extensionForMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("png")) {
    return "upload.png";
  }
  if (lower.includes("gif")) {
    return "upload.gif";
  }
  if (lower.includes("webp")) {
    return "upload.webp";
  }
  if (lower.includes("jpeg") || lower.includes("jpg")) {
    return "upload.jpg";
  }
  if (lower.includes("svg")) {
    return "upload.svg";
  }
  return "upload.bin";
}

export function filenameFromUrl(srcUrl: string, mimeType: string): string {
  try {
    const path = new URL(srcUrl).pathname;
    const base = path.split("/").pop();
    if (base !== undefined && base !== "" && base.includes(".")) {
      return base;
    }
  } catch {
    // Ignore malformed URLs.
  }
  return extensionForMime(mimeType);
}

export async function fetchImageInBackground(
  fetchImpl: typeof fetch,
  srcUrl: string,
): Promise<ResolvedImagePayload | undefined> {
  if (srcUrl.startsWith("data:")) {
    return parseDataUrl(srcUrl);
  }
  if (srcUrl.startsWith("blob:")) {
    return undefined;
  }
  try {
    const response = await fetchImpl(srcUrl, {
      method: "GET",
      credentials: "omit",
      redirect: "follow",
    });
    if (!response.ok) {
      return undefined;
    }
    const mimeType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (mimeType === undefined || !mimeType.startsWith("image/")) {
      return undefined;
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength > IMMICH_MAX_BYTES) {
      return undefined;
    }
    return {
      bytes,
      mimeType,
      filename: filenameFromUrl(response.url || srcUrl, mimeType),
    };
  } catch {
    return undefined;
  }
}

function findImageElement(
  document: Document,
  contextElement: Element | null,
  srcUrl: string,
): HTMLImageElement | undefined {
  if (contextElement instanceof HTMLImageElement) {
    return contextElement;
  }
  if (contextElement !== null) {
    const nested = contextElement.querySelector("img");
    if (nested instanceof HTMLImageElement) {
      return nested;
    }
  }
  for (const image of Array.from(document.querySelectorAll("img"))) {
    if (image.currentSrc === srcUrl || image.src === srcUrl) {
      return image;
    }
  }
  return undefined;
}

export async function resolveImageFromPage(
  document: Document,
  srcUrl: string,
  contextElement: Element | null,
  fetchImpl: typeof fetch,
  credentials: RequestCredentials,
): Promise<ResolvedImagePayload | undefined> {
  const imageElement = findImageElement(document, contextElement, srcUrl);
  const resolvedUrl =
    imageElement !== undefined &&
    imageElement.currentSrc !== "" &&
    imageElement.currentSrc !== srcUrl
      ? imageElement.currentSrc
      : srcUrl;
  if (resolvedUrl.startsWith("data:")) {
    return parseDataUrl(resolvedUrl);
  }
  try {
    const response = await fetchImpl(resolvedUrl, {
      method: "GET",
      credentials,
      redirect: "follow",
    });
    if (!response.ok) {
      return undefined;
    }
    const mimeType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (mimeType === undefined || !mimeType.startsWith("image/")) {
      return undefined;
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength > IMMICH_MAX_BYTES) {
      return undefined;
    }
    return {
      bytes,
      mimeType,
      filename: filenameFromUrl(response.url || resolvedUrl, mimeType),
    };
  } catch {
    return undefined;
  }
}

export async function uploadToImmich(
  fetchImpl: typeof fetch,
  config: ImmichUploadConfig,
  image: ResolvedImagePayload,
  deviceAssetId: string,
): Promise<ImmichUploadResult> {
  if (!image.mimeType.toLowerCase().startsWith("image/")) {
    return { outcome: "failed", reason: "unsupported-type" };
  }
  if (image.bytes.byteLength > IMMICH_MAX_BYTES) {
    return { outcome: "failed", reason: "too-large" };
  }
  const apiBase = immichApiBase(config.serverUrl);
  const now = new Date().toISOString();
  const form = new FormData();
  form.append(
    "assetData",
    new Blob([Uint8Array.from(image.bytes)], { type: image.mimeType }),
    image.filename,
  );
  form.append("deviceAssetId", deviceAssetId);
  form.append("deviceId", IMMICH_DEVICE_ID);
  form.append("fileCreatedAt", now);
  form.append("fileModifiedAt", now);
  try {
    const response = await fetchImpl(`${apiBase}/assets`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-api-key": config.apiKey,
      },
      body: form,
      credentials: "omit",
    });
    if (response.status === 401 || response.status === 403) {
      return { outcome: "failed", reason: "bad-key" };
    }
    if (!response.ok && response.status !== 200) {
      return { outcome: "failed", reason: "upload-rejected" };
    }
    let duplicate = false;
    try {
      const body: unknown = await response.json();
      if (isRecord(body) && body.duplicate === true) {
        duplicate = true;
      }
      if (isRecord(body) && body.status === "duplicate") {
        duplicate = true;
      }
    } catch {
      // Empty body on some success paths.
    }
    if (duplicate || response.status === 200) {
      return duplicate
        ? { outcome: "duplicate", reason: "duplicate" }
        : { outcome: "success", reason: "uploaded" };
    }
    return { outcome: "success", reason: "uploaded" };
  } catch {
    return { outcome: "failed", reason: "network-error" };
  }
}

export function immichModActive(
  enabled: boolean | undefined,
  grants: readonly string[] | undefined,
): boolean {
  return (
    enabled !== false &&
    grants?.includes(IMMICH_CAPABILITY) === true
  );
}

export function notificationBodyForResult(result: ImmichUploadResult): string {
  switch (result.reason) {
    case "bad-key":
      return "Immich rejected the API key.";
    case "unreachable":
      return "Could not reach the Immich server.";
    case "network-error":
      return "Network error talking to Immich or loading the image.";
    case "too-large":
      return "Image is too large to upload.";
    case "unsupported-type":
      return "Only image types are supported.";
    case "not-configured":
      return "Set your Immich server URL and API key in Prism settings.";
    case "no-image":
      return "Could not read image bytes from this page.";
    case "duplicate":
      return "Photo is already in Immich.";
    case "uploaded":
      return "Photo uploaded to Immich.";
    case "connected":
      return "Connected to Immich.";
    default:
      if (result.outcome === "duplicate") {
        return "Photo is already in Immich.";
      }
      if (result.outcome === "success") {
        return "Photo uploaded to Immich.";
      }
      return "Upload failed.";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
