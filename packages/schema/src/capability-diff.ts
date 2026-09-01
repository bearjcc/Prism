import type { CapabilityId } from "./capabilities.js";
import type { EgressContract, PrismManifest } from "./manifest.js";

export interface CapabilityDiff {
  increases: string[];
  decreases: string[];
}

export function capabilityDiff(
  from: PrismManifest,
  to: PrismManifest,
): CapabilityDiff {
  const increases: string[] = [];
  const decreases: string[] = [];

  diffCapabilities(from, to, increases, decreases);
  diffEgress(from, to, increases, decreases);

  return { increases, decreases };
}

function capSet(ids: readonly CapabilityId[] | undefined): Set<CapabilityId> {
  return new Set(ids ?? []);
}

function sortedUnion<T>(a: Set<T>, b: Set<T>): T[] {
  return [...new Set([...a, ...b])].sort();
}

function diffCapabilities(
  from: PrismManifest,
  to: PrismManifest,
  increases: string[],
  decreases: string[],
): void {
  const fromRequired = capSet(from.capabilities.required);
  const toRequired = capSet(to.capabilities.required);
  const fromOptional = capSet(from.capabilities.optional);
  const toOptional = capSet(to.capabilities.optional);
  const ids = sortedUnion(
    new Set([...fromRequired, ...fromOptional]),
    new Set([...toRequired, ...toOptional]),
  );

  for (const id of ids) {
    const wasRequired = fromRequired.has(id);
    const wasOptional = fromOptional.has(id);
    const isRequired = toRequired.has(id);
    const isOptional = toOptional.has(id);
    const wasPresent = wasRequired || wasOptional;
    const isPresent = isRequired || isOptional;

    if (!wasPresent && isRequired) {
      increases.push(`Adds required capability ${id}.`);
      continue;
    }
    if (!wasPresent && isOptional) {
      increases.push(`Adds optional capability ${id}.`);
      continue;
    }
    if (wasRequired && !isPresent) {
      decreases.push(`Removes required capability ${id}.`);
      continue;
    }
    if (wasOptional && !isPresent) {
      decreases.push(`Removes optional capability ${id}.`);
      continue;
    }
    if (wasRequired && isOptional && !isRequired) {
      decreases.push(
        `Changes capability ${id} from required to optional.`,
      );
      continue;
    }
    if (wasOptional && isRequired && !isOptional) {
      increases.push(
        `Changes capability ${id} from optional to required.`,
      );
    }
  }
}

function contractsById(
  manifest: PrismManifest,
): Map<string, EgressContract> {
  const map = new Map<string, EgressContract>();
  for (const contract of manifest.egress?.contracts ?? []) {
    map.set(contract.id, contract);
  }
  return map;
}

function contractOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function methodsLabel(methods: string[] | undefined): string {
  if (methods === undefined || methods.length === 0) {
    return "(none)";
  }
  return methods.join(", ");
}

function methodsExpanded(
  from: string[] | undefined,
  to: string[] | undefined,
): boolean {
  const before = new Set(from ?? []);
  const after = new Set(to ?? []);
  for (const method of after) {
    if (!before.has(method)) {
      return true;
    }
  }
  return false;
}

function methodsReduced(
  from: string[] | undefined,
  to: string[] | undefined,
): boolean {
  const before = new Set(from ?? []);
  const after = new Set(to ?? []);
  for (const method of before) {
    if (!after.has(method)) {
      return true;
    }
  }
  return false;
}

function diffEgress(
  from: PrismManifest,
  to: PrismManifest,
  increases: string[],
  decreases: string[],
): void {
  const before = contractsById(from);
  const after = contractsById(to);
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();

  for (const id of ids) {
    const previous = before.get(id);
    const next = after.get(id);

    if (previous === undefined && next !== undefined) {
      increases.push(`Adds egress contract ${id}.`);
      continue;
    }
    if (previous !== undefined && next === undefined) {
      decreases.push(`Removes egress contract ${id}.`);
      continue;
    }
    if (previous === undefined || next === undefined) {
      continue;
    }

    const previousOrigin = contractOrigin(previous.url);
    const nextOrigin = contractOrigin(next.url);
    if (previousOrigin !== nextOrigin) {
      increases.push(
        `Changes egress contract ${id} origin from ${previousOrigin} to ${nextOrigin}.`,
      );
    } else if (previous.url !== next.url) {
      increases.push(
        `Changes egress contract ${id} URL from ${previous.url} to ${next.url}.`,
      );
    }

    if (methodsLabel(previous.methods) === methodsLabel(next.methods)) {
      continue;
    }
    const line =
      `Changes egress contract ${id} methods from ${methodsLabel(previous.methods)} to ${methodsLabel(next.methods)}.`;
    if (methodsExpanded(previous.methods, next.methods)) {
      increases.push(line);
    }
    if (methodsReduced(previous.methods, next.methods)) {
      decreases.push(line);
    }
  }
}
