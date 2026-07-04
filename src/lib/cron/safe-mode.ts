const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

type SafeModeResult = {
  skip: boolean;
  reason?: string;
  mode: "off" | "manual" | "health";
};

function parseCsv(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isTrue(value?: string): boolean {
  if (!value) return false;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

function isPathAllowed(pathname: string): boolean {
  const allowList = parseCsv(process.env.CRON_SAFE_MODE_ALLOW_PATHS);
  return allowList.includes(pathname);
}

async function canReachSupabase(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return true;

  const timeoutMs = Number(process.env.CRON_SAFE_MODE_HEALTH_TIMEOUT_MS || 2500);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${url}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.ok) return true;
    if (response.status >= 500 || response.status === 408 || response.status === 429) return false;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function evaluateCronSafeMode(pathname: string): Promise<SafeModeResult> {
  if (isPathAllowed(pathname)) {
    return { skip: false, mode: "off" };
  }

  if (isTrue(process.env.CRON_SAFE_MODE)) {
    return {
      skip: true,
      mode: "manual",
      reason: "CRON_SAFE_MODE is enabled",
    };
  }

  const healthCheckEnabled = !isTrue(process.env.CRON_SAFE_MODE_DISABLE_HEALTHCHECK);
  if (!healthCheckEnabled) {
    return { skip: false, mode: "off" };
  }

  const healthy = await canReachSupabase();
  if (!healthy) {
    return {
      skip: true,
      mode: "health",
      reason: "Supabase healthcheck failed or timed out",
    };
  }

  return { skip: false, mode: "off" };
}
