function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function usefulText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value instanceof Error && value.message.trim()) return value.message.trim();

  const record = objectRecord(value);
  if (!record) return null;

  const nested = record.error;
  if (nested !== undefined && nested !== value) {
    const text = usefulText(nested);
    if (text) return text;
  }

  const parts = [
    ["message", record.message],
    ["code", record.code],
    ["details", record.details],
    ["hint", record.hint],
    ["error_description", record.error_description],
  ]
    .map(([label, candidate]) => {
      if (typeof candidate === "string" && candidate.trim()) return `${label}=${candidate.trim()}`;
      if (typeof candidate === "number" || typeof candidate === "boolean") return `${label}=${String(candidate)}`;
      return null;
    })
    .filter(Boolean);

  if (parts.length) return parts.join("; ");

  try {
    const serialized = JSON.stringify(record);
    return serialized && serialized !== "{}" ? serialized : null;
  } catch {
    return null;
  }
}

export function nexusInternalApiErrorMessage(path: string, status: number, body: unknown) {
  const detail = usefulText(body);
  return detail
    ? `${path} failed (${status}): ${detail}`
    : `${path} failed (${status})`;
}
