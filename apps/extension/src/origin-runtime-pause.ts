export const RUNTIME_PAUSED_ORIGINS_KEY = "runtimePausedOrigins";

export function isOriginRuntimePaused(
  pausedOrigins: readonly string[] | undefined,
  origin: string | undefined,
): boolean {
  return (
    origin !== undefined && (pausedOrigins ?? []).includes(origin)
  );
}

export function updateRuntimePausedOrigins(
  current: readonly string[] | undefined,
  origin: string,
  paused: boolean,
): string[] {
  const next = new Set(current ?? []);
  if (paused) {
    next.add(origin);
  } else {
    next.delete(origin);
  }
  return [...next];
}

export function describeOriginRuntimePause(): string {
  return "Pause Prism on this site stops all mods here until you turn this off. Behaviour policies stay as set.";
}
