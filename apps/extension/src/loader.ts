import type { CapabilityId, PrismApi, PrismManifest } from "@prism/schema";
import { validateManifest } from "@prism/schema/validate";
import {
  createPrismApi,
  type PrismApiHandlers,
  type TabUndoStack,
} from "./prism-api.js";

export interface BundledMod {
  readonly manifest: PrismManifest;
  readonly entry: string | null;
}

export interface NativeMod {
  readonly manifest: PrismManifest;
  readonly activate?: (prism: PrismApi) => void | Promise<void>;
  readonly load?: () => Promise<Pick<NativeMod, "activate">>;
}

export type ModLoadStatus =
  | "active"
  | "disabled"
  | "failed"
  | "missing-required-capability"
  | "out-of-scope";

export interface ModLoadState {
  readonly id: string;
  readonly status: ModLoadStatus;
}

export interface LoadNativeModsOptions {
  readonly url: string;
  readonly tabId: number;
  readonly enabledByMod?: Readonly<Record<string, boolean>>;
  readonly grantsByMod: Readonly<Record<string, readonly CapabilityId[]>>;
  readonly handlers: PrismApiHandlers;
  readonly undo?: TabUndoStack;
}

export async function loadNativeMods(
  mods: readonly NativeMod[],
  options: LoadNativeModsOptions,
): Promise<ModLoadState[]> {
  return Promise.all(
    mods.map(async (mod): Promise<ModLoadState> => {
      try {
        if (options.enabledByMod?.[mod.manifest.id] === false) {
          return { id: mod.manifest.id, status: "disabled" };
        }
        if (!matchesAnyScope(mod.manifest.scopes, options.url)) {
          return { id: mod.manifest.id, status: "out-of-scope" };
        }

        const grants = options.grantsByMod[mod.manifest.id] ?? [];
        if (
          mod.manifest.capabilities.required.some(
            (capability) => !grants.includes(capability),
          )
        ) {
          return {
            id: mod.manifest.id,
            status: "missing-required-capability",
          };
        }

        const prism = createPrismApi({
          manifest: mod.manifest,
          grants,
          tabId: options.tabId,
          handlers: options.handlers,
          ...(options.undo === undefined ? {} : { undo: options.undo }),
        });
        const loaded = mod.load === undefined ? mod : await mod.load();
        await loaded.activate?.(prism);
        return { id: mod.manifest.id, status: "active" };
      } catch {
        return { id: mod.manifest.id, status: "failed" };
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
    return {
      manifest,
      entry: entry.entry ?? null,
    };
  });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
