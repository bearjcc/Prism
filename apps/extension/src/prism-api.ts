import type {
  AdSlotHandle,
  BrokeredResponse,
  CapabilityId,
  ItemType,
  PrismApi,
  PrismManifest,
  SurfaceId,
  TrustedReplacement,
} from "@prism/schema";
import type { ActivityEvent } from "./gate.js";
import { createCapabilityGate } from "./gate.js";
import { sanitiseCss } from "./css.js";

type Undo = () => void;

export interface PrismApiHandlers {
  readonly replaceSlot?: (
    slot: AdSlotHandle,
    content: TrustedReplacement,
    manifest: PrismManifest,
  ) => void | Undo;
  readonly applyCss?: (cssText: string) => void | Undo;
  readonly allowlist?: (
    surface: SurfaceId,
    itemType: ItemType,
  ) => void | Undo;
  readonly extract?: (
    capability: CapabilityId,
    input?: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
  readonly request?: (
    contractId: string,
    manifest: PrismManifest,
  ) => Promise<BrokeredResponse>;
}

export interface CreatePrismApiOptions {
  readonly manifest: PrismManifest;
  readonly grants: readonly CapabilityId[];
  readonly tabId: number;
  readonly handlers: PrismApiHandlers;
  readonly undo?: TabUndoStack;
  readonly emit?: (event: ActivityEvent) => void;
}

export class TabUndoStack {
  readonly #stacks = new Map<number, Undo[]>();

  push(tabId: number, undo: Undo): void {
    const stack = this.#stacks.get(tabId) ?? [];
    stack.push(undo);
    this.#stacks.set(tabId, stack);
  }

  undoLast(tabId: number): boolean {
    const stack = this.#stacks.get(tabId);
    const undo = stack?.pop();
    if (undo === undefined) {
      return false;
    }
    undo();
    if (stack?.length === 0) {
      this.#stacks.delete(tabId);
    }
    return true;
  }
}

export function createPrismApi(options: CreatePrismApiOptions): PrismApi {
  const gate = createCapabilityGate(options);

  function record(result: void | Undo): void {
    if (typeof result === "function") {
      options.undo?.push(options.tabId, result);
    }
  }

  return {
    slots: {
      replace(slot, content): void {
        gate.assert("visual.ad-slot.replace");
        record(options.handlers.replaceSlot?.(slot, content, options.manifest));
      },
    },
    styles: {
      apply(cssText): void {
        gate.assert("visual.hide");
        record(options.handlers.applyCss?.(sanitiseCss(cssText)));
      },
    },
    ui: {
      allowlist(surface, itemType): void {
        gate.assert("youtube.home.allowlist");
        record(options.handlers.allowlist?.(surface, itemType));
      },
    },
    async extract(capability, input): Promise<unknown> {
      gate.assert(capability);
      if (options.handlers.extract === undefined) {
        throw new Error(`No extractor registered for ${capability}`);
      }
      return options.handlers.extract(capability, input);
    },
    net: {
      async request(contractId): Promise<BrokeredResponse> {
        gate.assertEgressContract(contractId);
        if (options.handlers.request === undefined) {
          throw new Error(`No network broker registered for ${contractId}`);
        }
        return options.handlers.request(contractId, options.manifest);
      },
    },
  };
}
