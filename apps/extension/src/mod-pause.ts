import type { ModLoadState } from "./loader.js";

/** Consecutive activate failures on one origin before that mod is paused there. */
export const MOD_FAILURE_BUDGET = 3;

export const MOD_FAILURE_BUDGET_STORAGE_KEY = "modFailureBudget";

export interface ModOriginBudget {
  readonly failures: number;
  readonly paused: boolean;
}

export type ModFailureBudgetState = Record<
  string,
  Record<string, ModOriginBudget>
>;

export function originFromPageUrl(url: string): string | undefined {
  try {
    const origin = new URL(url).origin;
    return origin.startsWith("http") ? origin : undefined;
  } catch {
    return undefined;
  }
}

export function isModPausedOnOrigin(
  state: ModFailureBudgetState | undefined,
  modId: string,
  origin: string,
): boolean {
  return state?.[modId]?.[origin]?.paused === true;
}

export function pausedOriginsByMod(
  state: ModFailureBudgetState | undefined,
): Record<string, string[]> {
  const paused: Record<string, string[]> = {};
  for (const [modId, origins] of Object.entries(state ?? {})) {
    const list = Object.entries(origins)
      .filter(([, budget]) => budget.paused)
      .map(([origin]) => origin);
    if (list.length > 0) {
      paused[modId] = list;
    }
  }
  return paused;
}

export function mergeOriginExclusions(
  siteExceptions: Readonly<Record<string, readonly string[]>>,
  paused: Readonly<Record<string, readonly string[]>>,
): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  const ids = new Set([...Object.keys(siteExceptions), ...Object.keys(paused)]);
  for (const id of ids) {
    merged[id] = [
      ...new Set([...(siteExceptions[id] ?? []), ...(paused[id] ?? [])]),
    ];
  }
  return merged;
}

export function recordModFailure(
  state: ModFailureBudgetState | undefined,
  modId: string,
  origin: string,
): ModFailureBudgetState {
  const current = state?.[modId]?.[origin];
  if (current?.paused === true) {
    return cloneBudget(state);
  }
  const failures = (current?.failures ?? 0) + 1;
  return setBudget(state, modId, origin, {
    failures,
    paused: failures >= MOD_FAILURE_BUDGET,
  });
}

export function recordModSuccess(
  state: ModFailureBudgetState | undefined,
  modId: string,
  origin: string,
): ModFailureBudgetState {
  const current = state?.[modId]?.[origin];
  if (current === undefined || current.paused) {
    return cloneBudget(state);
  }
  if (current.failures === 0) {
    return cloneBudget(state);
  }
  return setBudget(state, modId, origin, { failures: 0, paused: false });
}

export function setModPausedOnOrigin(
  state: ModFailureBudgetState | undefined,
  modId: string,
  origin: string,
  paused: boolean,
): ModFailureBudgetState {
  if (!paused) {
    return setBudget(state, modId, origin, { failures: 0, paused: false });
  }
  const failures = Math.max(
    state?.[modId]?.[origin]?.failures ?? 0,
    MOD_FAILURE_BUDGET,
  );
  return setBudget(state, modId, origin, { failures, paused: true });
}

export async function reportModLoadOutcomes(
  states: readonly ModLoadState[],
  pageUrl: string,
  send: (message: {
    readonly type: "record-mod-failure" | "record-mod-success";
    readonly modId: string;
    readonly origin: string;
  }) => Promise<unknown>,
): Promise<void> {
  const origin = originFromPageUrl(pageUrl);
  if (origin === undefined) {
    return;
  }
  await Promise.all(
    states.map(async (state) => {
      try {
        if (state.status === "failed") {
          await send({
            type: "record-mod-failure",
            modId: state.id,
            origin,
          });
        } else if (state.status === "active") {
          await send({
            type: "record-mod-success",
            modId: state.id,
            origin,
          });
        }
      } catch {
        // Outcome reporting must not break page load or sibling mods.
      }
    }),
  );
}

function setBudget(
  state: ModFailureBudgetState | undefined,
  modId: string,
  origin: string,
  budget: ModOriginBudget,
): ModFailureBudgetState {
  const next = cloneBudget(state);
  next[modId] = { ...next[modId], [origin]: budget };
  return next;
}

function cloneBudget(
  state: ModFailureBudgetState | undefined,
): ModFailureBudgetState {
  const next: ModFailureBudgetState = {};
  for (const [modId, origins] of Object.entries(state ?? {})) {
    next[modId] = { ...origins };
  }
  return next;
}
