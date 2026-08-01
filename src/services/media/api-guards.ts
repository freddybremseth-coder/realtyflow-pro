const mediaRateLimits = new Map<string, { count: number; resetAt: number }>();

export class MediaApiGuardError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "MEDIA_API_GUARD",
  ) {
    super(message);
    this.name = "MediaApiGuardError";
  }
}

export function assertMediaRateLimit(
  identity: string,
  action: "plan" | "generate" | "retry" | "export" | "capability_refresh" | "voice_script",
  now = Date.now(),
) {
  const windows = {
    plan: { max: 20, ms: 60_000, weight: 1 },
    generate: { max: 8, ms: 60_000, weight: 2 },
    retry: { max: 6, ms: 60_000, weight: 2 },
    export: { max: 20, ms: 60_000, weight: 1 },
    capability_refresh: { max: 4, ms: 60_000, weight: 1 },
    voice_script: { max: 10, ms: 60_000, weight: 2 },
  } as const;
  const config = windows[action];
  const key = `${identity}:${action}`;
  const current = mediaRateLimits.get(key);

  if (!current || current.resetAt <= now) {
    mediaRateLimits.set(key, { count: config.weight, resetAt: now + config.ms });
    return;
  }
  if (current.count + config.weight > config.max) {
    throw new MediaApiGuardError("For mange Media Studio-handlinger på kort tid. Vent litt og prøv igjen.", 429, "RATE_LIMITED");
  }
  current.count += config.weight;
}
