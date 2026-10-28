import { detectTouchCapable } from "./immich-mobile-chip.js";
import { IMMICH_MOD_ID } from "./immich-upload.js";
import { installImmichMobileChip } from "./immich-mobile-ui.js";

interface ImmichPageUiState {
  readonly modActive: boolean;
  readonly useMobileChip: boolean;
}

interface ImmichPageUiRuntime {
  sendMessage<T>(message: unknown): Promise<T>;
}

export function createImmichPageUiController(
  document: Document,
  runtime: ImmichPageUiRuntime,
): Readonly<{
  refresh(): Promise<void>;
  teardown(): void;
}> {
  let chipTeardown: (() => void) | undefined;

  function teardown(): void {
    chipTeardown?.();
    chipTeardown = undefined;
  }

  async function refresh(): Promise<void> {
    const state = await runtime.sendMessage<ImmichPageUiState>({
      type: "get-immich-page-ui",
      touchCapable: detectTouchCapable(globalThis),
    });
    if (state.modActive !== true) {
      teardown();
      return;
    }
    if (state.useMobileChip !== true) {
      teardown();
      return;
    }
    if (chipTeardown !== undefined) {
      return;
    }
    chipTeardown = installImmichMobileChip(document, (image, srcUrl) => {
      void runtime.sendMessage({
        type: "immich-upload-image",
        srcUrl,
        pageOrigin: globalThis.location.origin,
      });
    });
  }

  return { refresh, teardown };
}

export function activeModsIncludeImmich(
  mods: ReadonlyArray<{ readonly manifest: { readonly id: string } }>,
): boolean {
  return mods.some((mod) => mod.manifest.id === IMMICH_MOD_ID);
}
