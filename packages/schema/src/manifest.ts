import type { CapabilityId } from "./capabilities.js";

export interface ManifestCapabilities {
  required: CapabilityId[];
  optional?: CapabilityId[];
}

export interface EgressContract {
  id: string;
  url: string;
  methods?: string[];
}

export interface ManifestEgress {
  contracts: EgressContract[];
}

export interface ManifestFilters {
  browser?: string[];
}

export interface PrismManifest {
  id: string;
  version: string;
  runtime: "native";
  capabilities: ManifestCapabilities;
  scopes: string[];
  egress?: ManifestEgress;
  filters?: ManifestFilters;
  assets?: string[];
  fixtures?: string[];
}

export interface AdSlotHandle {
  readonly id: string;
}

export interface TrustedReplacement {
  readonly asset: string;
  readonly alt: string;
}

export type SurfaceId = string;
export type ItemType = string;

export interface BrokeredResponse {
  readonly status: number;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface PrismApi {
  readonly slots: {
    replace(slot: AdSlotHandle, content: TrustedReplacement): void;
  };
  readonly styles: {
    apply(cssText: string): void;
  };
  readonly ui: {
    allowlist(surface: SurfaceId, itemType: ItemType): void;
  };
  extract(
    capabilityId: CapabilityId,
    input?: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  readonly net: {
    request(contractId: string): Promise<BrokeredResponse>;
  };
}
