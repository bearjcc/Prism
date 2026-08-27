import type { CapabilityId, PrismManifest } from "@prism/schema";

export interface ActivityEvent {
  readonly layer: "capability-gate";
  readonly modId: string;
  readonly capability: CapabilityId;
  readonly outcome: "allowed" | "denied";
}

export interface CapabilityGate {
  assert(capability: CapabilityId): void;
  assertEgressContract(contractId: string): void;
}

export interface CapabilityGateOptions {
  readonly manifest: PrismManifest;
  readonly grants: readonly CapabilityId[];
  readonly emit?: (event: ActivityEvent) => void;
}

export class CapabilityDeniedError extends Error {
  readonly modId: string;
  readonly capability: CapabilityId;

  constructor(modId: string, capability: CapabilityId) {
    super(`Mod ${modId} is not granted capability ${capability}`);
    this.name = "CapabilityDeniedError";
    this.modId = modId;
    this.capability = capability;
  }
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

  function decide(capability: CapabilityId, extraAllowed = true): void {
    const allowed =
      declared.has(capability) && granted.has(capability) && extraAllowed;
    options.emit?.({
      layer: "capability-gate",
      modId: options.manifest.id,
      capability,
      outcome: allowed ? "allowed" : "denied",
    });
    if (!allowed) {
      throw new CapabilityDeniedError(options.manifest.id, capability);
    }
  }

  return {
    assert(capability): void {
      decide(capability);
    },
    assertEgressContract(contractId): void {
      decide("network.egress", contracts.has(contractId));
    },
  };
}
