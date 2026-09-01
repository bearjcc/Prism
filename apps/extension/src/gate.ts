import type { CapabilityId, PrismManifest } from "@prism/schema";
import { isCapabilityId } from "@prism/schema/capabilities";

export type ActivityEvent =
  | {
      readonly layer: "capability-gate";
      readonly modId: string;
      readonly capability: CapabilityId;
      readonly outcome: "allowed" | "denied";
    }
  | {
      readonly layer: "userscript-runtime";
      readonly modId: string;
      readonly outcome: "allowed" | "denied";
    };

export type StoredActivityEvent = ActivityEvent & {
  readonly at: number;
};

export const ACTIVITY_EVENT_LIMIT = 50;

export function isActivityEvent(value: unknown): value is ActivityEvent {
  if (
    !isRecord(value) ||
    typeof value.modId !== "string" ||
    value.modId === "" ||
    (value.outcome !== "allowed" && value.outcome !== "denied")
  ) {
    return false;
  }
  if (value.layer === "userscript-runtime") {
    return true;
  }
  return (
    value.layer === "capability-gate" &&
    typeof value.capability === "string" &&
    isCapabilityId(value.capability)
  );
}

export function appendActivityEvents(
  current: readonly StoredActivityEvent[],
  event: StoredActivityEvent,
  limit = ACTIVITY_EVENT_LIMIT,
): StoredActivityEvent[] {
  return [event, ...current].slice(0, limit);
}

export interface CapabilityGate {
  assert(capability: CapabilityId): boolean;
  assertEgressContract(contractId: string): boolean;
}

export interface CapabilityGateOptions {
  readonly manifest: PrismManifest;
  readonly grants: readonly CapabilityId[];
  readonly emit?: (event: ActivityEvent) => void | Promise<void>;
}

export function createCapabilityGate(
  options: CapabilityGateOptions,
): CapabilityGate {
  const declared = new Set<CapabilityId>([
    ...options.manifest.capabilities.required,
    ...(options.manifest.capabilities.optional ?? []),
  ]);
  const granted = new Set(options.grants);
  const contracts = new Set(
    options.manifest.egress?.contracts.map((contract) => contract.id) ?? [],
  );

  function decide(capability: CapabilityId, extraAllowed = true): boolean {
    const allowed =
      declared.has(capability) && granted.has(capability) && extraAllowed;
    options.emit?.({
      layer: "capability-gate",
      modId: options.manifest.id,
      capability,
      outcome: allowed ? "allowed" : "denied",
    });
    return allowed;
  }

  return {
    assert(capability): boolean {
      return decide(capability);
    },
    assertEgressContract(contractId): boolean {
      return decide("network.egress", contracts.has(contractId));
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
