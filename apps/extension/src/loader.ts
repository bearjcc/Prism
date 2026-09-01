import type { CapabilityId, PrismApi, PrismManifest } from "@prism/schema";
import { isStyleSourcePath } from "@prism/schema/css";
import { inspectPackage } from "@prism/schema/inspect-package";
import { validateManifest } from "@prism/schema/validate";
import type { ActivityEvent } from "./gate.js";
import {
  createPrismApi,
  type PrismApiHandlers,
  type TabUndoStack,
} from "./prism-api.js";

export interface BundledMod {
  readonly manifest: PrismManifest;
  readonly entry: string | null;
  readonly origin?: "bundled" | "imported";
  readonly entrySource?: string;
  readonly assetUrls?: Readonly<Record<string, string>>;
  readonly files?: Readonly<Record<string, Uint8Array>>;
  readonly styles?: readonly string[];
}

export interface NativeMod {
  readonly manifest: PrismManifest;
  readonly activate?: (prism: PrismApi) => void | Promise<void>;
  readonly load?: () => Promise<Pick<NativeMod, "activate" | "files" | "styles">>;
  readonly files?: Readonly<Record<string, Uint8Array>>;
  readonly styles?: readonly string[];
  readonly entrySource?: string;
}

export type ModLoadStatus =
  | "active"
  | "disabled"
  | "failed"
  | "paused"
  | "missing-required-capability"
  | "out-of-scope"
  | "userscript-blocked";

export type ModTrustKind = "css" | "declarative" | "userscript";

export type UserScriptExecutionWorld = "USER_SCRIPT";

export interface UserScriptRegistration {
  readonly id: string;
  readonly matches: readonly string[];
  readonly js: ReadonlyArray<{ readonly code: string }>;
  readonly world: UserScriptExecutionWorld;
}

export interface UserScriptsApi {
  getScripts(): Promise<unknown>;
  unregister(filter?: { ids?: readonly string[] }): Promise<void>;
  register(scripts: readonly UserScriptRegistration[]): Promise<void>;
}

export interface ModLoadState {
  readonly id: string;
  readonly status: ModLoadStatus;
}

export interface LoadNativeModsOptions {
  readonly url: string;
  readonly tabId: number;
  readonly enabledByMod?: Readonly<Record<string, boolean>>;
  readonly pausedByMod?: Readonly<Record<string, boolean>>;
  readonly grantsByMod: Readonly<Record<string, readonly CapabilityId[]>>;
  readonly handlers: PrismApiHandlers;
  readonly undo?: TabUndoStack;
  readonly emit?: (event: ActivityEvent) => void | Promise<void>;
  readonly onStateChange?: (state: ModLoadState) => void;
  readonly userscriptsAvailable?: boolean;
  readonly runEntry?: (
    source: string,
    prism: PrismApi,
  ) => Promise<void>;
}

export async function loadNativeMods(
  mods: readonly NativeMod[],
  options: LoadNativeModsOptions,
): Promise<ModLoadState[]> {
  return Promise.all(
    mods.map(async (mod): Promise<ModLoadState> => {
      const report = (status: ModLoadStatus): ModLoadState => {
        const state = { id: mod.manifest.id, status };
        options.onStateChange?.(state);
        return state;
      };
      const pendingActivity: Promise<void>[] = [];
      try {
        if (options.enabledByMod?.[mod.manifest.id] === false) {
          return report("disabled");
        }
        if (options.pausedByMod?.[mod.manifest.id] === true) {
          return report("paused");
        }
        if (!matchesAnyScope(mod.manifest.scopes, options.url)) {
          return report("out-of-scope");
        }
        const policyFiles = mod.files ?? (
          mod.entrySource === undefined
            ? undefined
            : {
                "src/index.js": new TextEncoder().encode(mod.entrySource),
              }
        );
        if (
          policyFiles !== undefined &&
          !inspectPackage(mod.manifest, policyFiles).ok
        ) {
          return report("failed");
        }

        const grants = options.grantsByMod[mod.manifest.id] ?? [];
        if (
          mod.manifest.capabilities.required.some(
            (capability) => !grants.includes(capability),
          )
        ) {
          return report("missing-required-capability");
        }

        const userscriptBlocked =
          mod.manifest.runtime === "userscript" &&
          options.userscriptsAvailable !== true;
        const skipModEntry = mod.manifest.runtime === "userscript";
        const prism = createPrismApi({
          manifest: mod.manifest,
          grants,
          tabId: options.tabId,
          pageUrl: options.url,
          handlers: options.handlers,
          ...(options.undo === undefined ? {} : { undo: options.undo }),
          ...(options.emit === undefined
            ? {}
            : {
                emit: (event) => {
                  pendingActivity.push(Promise.resolve(options.emit?.(event)));
                },
              }),
        });
        const loaded =
          skipModEntry || mod.load === undefined ? mod : await mod.load();
        for (const cssText of resolveModStyles(mod, loaded)) {
          prism.styles.apply(cssText);
        }
        if (skipModEntry) {
          pendingActivity.push(
            Promise.resolve(
              options.emit?.({
                layer: "userscript-runtime",
                modId: mod.manifest.id,
                outcome: userscriptBlocked ? "denied" : "allowed",
              }),
            ),
          );
          await Promise.all(pendingActivity);
          return report(
            userscriptBlocked ? "userscript-blocked" : "active",
          );
        }
        if (mod.entrySource !== undefined && options.runEntry !== undefined) {
          await options.runEntry(mod.entrySource, prism);
        } else {
          await loaded.activate?.(prism);
        }
        await Promise.all(pendingActivity);
        return report("active");
      } catch (error) {
        await Promise.all(pendingActivity).catch(() => undefined);
        if (isAbortError(error)) {
          throw error;
        }
        return report("failed");
      }
    }),
  );
}

export function parseBundledMods(source: string): BundledMod[] {
  const value: unknown = JSON.parse(source);
  if (!Array.isArray(value)) {
    throw new Error("Bundled mod index must be an array");
  }

  const ids = new Set<string>();
  return value.map((entry, index) => {
    if (!isRecord(entry) || !isRecord(entry.manifest)) {
      throw new Error(`Bundled mod ${index} must contain a manifest`);
    }
    if (
      entry.entry !== null &&
      entry.entry !== undefined &&
      typeof entry.entry !== "string"
    ) {
      throw new Error(`Bundled mod ${index} entry must be a string or null`);
    }
    const manifest = validateManifest(
      JSON.stringify(entry.manifest),
      `bundled-mods.json[${index}]`,
    );
    if (ids.has(manifest.id)) {
      throw new Error(`Duplicate bundled mod id ${manifest.id}`);
    }
    ids.add(manifest.id);
    const styles = parseBundledStyles(entry.styles, index);
    if (
      entry.entrySource !== undefined &&
      typeof entry.entrySource !== "string"
    ) {
      throw new Error(`Bundled mod ${index} entrySource must be a string`);
    }
    return {
      origin: "bundled",
      manifest,
      entry: entry.entry ?? null,
      ...(entry.entrySource === undefined
        ? {}
        : { entrySource: entry.entrySource }),
      ...(styles === undefined ? {} : { styles }),
    };
  });
}

export function stylesFromModFiles(
  files: Readonly<Record<string, Uint8Array>> | undefined,
): string[] {
  if (files === undefined) {
    return [];
  }
  return Object.keys(files)
    .filter((path) => isStyleSourcePath(path) && path.toLowerCase().endsWith(".css"))
    .sort()
    .map((path) => new TextDecoder().decode(files[path]));
}

function resolveModStyles(
  mod: NativeMod,
  loaded: Pick<NativeMod, "files" | "styles">,
): string[] {
  if (loaded.styles !== undefined) {
    return [...loaded.styles];
  }
  if (mod.styles !== undefined) {
    return [...mod.styles];
  }
  return stylesFromModFiles(loaded.files ?? mod.files);
}

function parseBundledStyles(
  value: unknown,
  index: number,
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`Bundled mod ${index} styles must be an array of strings`);
  }
  return value;
}

export function classifyModTrust(
  mod: Pick<BundledMod, "manifest" | "entry" | "styles">,
): ModTrustKind {
  if (mod.manifest.runtime === "userscript") {
    return "userscript";
  }
  const hasFilters = (mod.manifest.filters?.browser ?? []).length > 0;
  const hasStyles = (mod.styles ?? []).length > 0;
  if (mod.entry === null && hasStyles && !hasFilters) {
    return "css";
  }
  return "declarative";
}

export async function probeUserScriptsAvailable(
  api: Pick<UserScriptsApi, "getScripts"> | undefined,
): Promise<boolean> {
  if (api === undefined) {
    return false;
  }
  try {
    await api.getScripts();
    return true;
  } catch {
    return false;
  }
}

export function userscriptRegistrations(
  mods: readonly BundledMod[],
  enabled: Readonly<Record<string, boolean>>,
): UserScriptRegistration[] {
  const scripts: UserScriptRegistration[] = [];
  for (const mod of mods) {
    if (
      mod.manifest.runtime !== "userscript" ||
      enabled[mod.manifest.id] === false ||
      mod.entrySource === undefined ||
      mod.entrySource === ""
    ) {
      continue;
    }
    if (userscriptSourceDeclaresRemoteScript(mod.entrySource)) {
      continue;
    }
    scripts.push({
      id: mod.manifest.id,
      matches: [...mod.manifest.scopes],
      js: [{ code: mod.entrySource }],
      world: "USER_SCRIPT",
    });
  }
  return scripts;
}

const REMOTE_SCHEME = /https?:\/\//iu;
const REMOTE_IMPORT = /\bimport\s*(?:\(\s*|\s+)['"`]https?:\/\//u;
const REMOTE_JS_FETCH =
  /\bfetch\s*\(\s*['"`]https?:\/\/[^'"`]*\.js(?:[?#][^'"`]*)?['"`]/iu;
const USERSCRIPT_HEADER =
  /\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/u;

function userscriptSourceDeclaresRemoteScript(source: string): boolean {
  const header = USERSCRIPT_HEADER.exec(source)?.[1] ?? "";
  for (const line of header.split(/\r?\n/u)) {
    if (
      /^\s*\/\/\s*@(?:require|resource)\b/iu.test(line) &&
      REMOTE_SCHEME.test(line)
    ) {
      return true;
    }
  }
  return REMOTE_IMPORT.test(source) || REMOTE_JS_FETCH.test(source);
}

export function matchesAnyScope(
  scopes: readonly string[],
  targetUrl: string,
): boolean {
  const target = new URL(targetUrl);
  return scopes.some((scope) => matchesScope(scope, target));
}

function matchesScope(scope: string, target: URL): boolean {
  if (scope === "<all_urls>") {
    return ["http:", "https:", "file:", "ftp:"].includes(target.protocol);
  }

  const match = /^(\*|http|https|file|ftp):\/\/([^/]*)(\/.*)$/u.exec(scope);
  if (match === null) {
    return false;
  }
  const [, scheme, host, path] = match;
  if (
    scheme === undefined ||
    host === undefined ||
    path === undefined ||
    !matchesScheme(scheme, target.protocol) ||
    !matchesHost(host, target.hostname)
  ) {
    return false;
  }
  return wildcardExpression(path).test(target.pathname);
}

function matchesScheme(pattern: string, protocol: string): boolean {
  if (pattern === "*") {
    return protocol === "http:" || protocol === "https:";
  }
  return `${pattern}:` === protocol;
}

function matchesHost(pattern: string, host: string): boolean {
  if (pattern === "*") {
    return true;
  }
  if (pattern.startsWith("*.")) {
    const base = pattern.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === pattern;
}

function wildcardExpression(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`, "u");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
