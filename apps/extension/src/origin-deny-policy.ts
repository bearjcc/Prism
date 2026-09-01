export interface OriginDenyPolicyState {
  readonly default: boolean;
  readonly denyOrigins: readonly string[];
}

export const DEFAULT_ORIGIN_DENY_POLICY: OriginDenyPolicyState = {
  default: true,
  denyOrigins: [],
};

export function isExactOrigin(origin: string): boolean {
  try {
    return new URL(origin).origin === origin;
  } catch {
    return false;
  }
}

export function normaliseOriginDenyPolicy(value: unknown): OriginDenyPolicyState {
  if (!isRecord(value)) {
    return DEFAULT_ORIGIN_DENY_POLICY;
  }
  const denyOrigins = Array.isArray(value.denyOrigins)
    ? value.denyOrigins.filter(
        (origin): origin is string =>
          typeof origin === "string" && isExactOrigin(origin),
      )
    : [];
  return {
    default: value.default !== false,
    denyOrigins,
  };
}

export function policyActiveForUrl(
  policy: OriginDenyPolicyState,
  url: string,
): boolean {
  if (policy.default === false) {
    return false;
  }
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return true;
  }
  return !policy.denyOrigins.includes(origin);
}

export function updateOriginDenyPolicy(
  current: OriginDenyPolicyState,
  change: {
    readonly default?: boolean;
    readonly origin?: string;
    readonly deny?: boolean;
  },
): OriginDenyPolicyState | undefined {
  let denyOrigins = [...current.denyOrigins];
  if (change.origin !== undefined) {
    if (change.deny === undefined || !isExactOrigin(change.origin)) {
      return undefined;
    }
    const selected = new Set(denyOrigins);
    if (change.deny) {
      selected.add(change.origin);
    } else {
      selected.delete(change.origin);
    }
    denyOrigins = [...selected];
  }
  return {
    default: change.default ?? current.default,
    denyOrigins,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
