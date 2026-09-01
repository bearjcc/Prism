import {
  DEFAULT_ORIGIN_DENY_POLICY,
  normaliseOriginDenyPolicy,
  policyActiveForUrl,
  type OriginDenyPolicyState,
} from "./origin-deny-policy.js";

export const BEHAVIOUR_POLICY_IDS = [
  "paste",
  "popup-suppress",
  "title-freeze",
  "scroll-lock",
  "overlay-suppress",
  "consent-reject",
  "autoplay",
] as const;

export type BehaviourPolicyId = (typeof BEHAVIOUR_POLICY_IDS)[number];

export const BEHAVIOUR_POLICY_STORAGE_KEYS = {
  paste: "behaviour.paste",
  "popup-suppress": "behaviour.popup-suppress",
  "title-freeze": "behaviour.title-freeze",
  "scroll-lock": "behaviour.scroll-lock",
  "overlay-suppress": "behaviour.overlay-suppress",
  "consent-reject": "behaviour.consent-reject",
  autoplay: "behaviour.autoplay",
} as const satisfies Record<BehaviourPolicyId, string>;

export type BehaviourPolicyStorageKey =
  (typeof BEHAVIOUR_POLICY_STORAGE_KEYS)[BehaviourPolicyId];

export const DEFAULT_BEHAVIOUR_POLICIES: Record<
  BehaviourPolicyId,
  OriginDenyPolicyState
> = Object.fromEntries(
  BEHAVIOUR_POLICY_IDS.map((id) => [id, DEFAULT_ORIGIN_DENY_POLICY]),
) as Record<BehaviourPolicyId, OriginDenyPolicyState>;

export function isBehaviourPolicyId(value: unknown): value is BehaviourPolicyId {
  return (
    typeof value === "string" &&
    (BEHAVIOUR_POLICY_IDS as readonly string[]).includes(value)
  );
}

export function readBehaviourPolicies(
  state: object,
): Record<BehaviourPolicyId, OriginDenyPolicyState> {
  const bag = state as Record<string, unknown>;
  const policies = {} as Record<BehaviourPolicyId, OriginDenyPolicyState>;
  for (const id of BEHAVIOUR_POLICY_IDS) {
    policies[id] = normaliseOriginDenyPolicy(
      bag[BEHAVIOUR_POLICY_STORAGE_KEYS[id]],
    );
  }
  return policies;
}

export type BehaviourPolicyResponse = {
  readonly default: boolean;
  readonly denyOrigins: readonly string[];
  readonly allow: boolean;
  readonly originDenied: boolean;
  readonly sessionDeniedOnOrigin: boolean;
};

export function behaviourPolicyResponse(
  policy: OriginDenyPolicyState,
  url: string | undefined,
  originOfUrl: (value: string) => string | undefined,
  sessionDeniedOrigins: readonly string[] = [],
): BehaviourPolicyResponse {
  const origin = url === undefined ? undefined : originOfUrl(url);
  const originDenied =
    origin !== undefined && policy.denyOrigins.includes(origin);
  const sessionDeniedOnOrigin =
    origin !== undefined && sessionDeniedOrigins.includes(origin);
  return {
    default: policy.default,
    denyOrigins: policy.denyOrigins,
    allow:
      url === undefined
        ? policy.default
        : policyActiveForUrl(policy, url) && !sessionDeniedOnOrigin,
    originDenied,
    sessionDeniedOnOrigin,
  };
}

export function behaviourPoliciesResponse(
  policies: Record<BehaviourPolicyId, OriginDenyPolicyState>,
  url: string | undefined,
  originOfUrl: (value: string) => string | undefined,
  sessionPolicyExceptions: Readonly<
    Record<string, readonly string[]>
  > = {},
): Record<BehaviourPolicyId, BehaviourPolicyResponse> {
  const responses = {} as Record<BehaviourPolicyId, BehaviourPolicyResponse>;
  for (const id of BEHAVIOUR_POLICY_IDS) {
    responses[id] = behaviourPolicyResponse(
      policies[id],
      url,
      originOfUrl,
      sessionPolicyExceptions[id] ?? [],
    );
  }
  return responses;
}
