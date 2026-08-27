const DEFAULT_REALTYFLOW_ORIGIN = "https://realtyflow.chatgenius.pro";

function safeOrigin(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function nexusInternalMutationOrigin(
  requestOrigin: string,
  configuredOrigin = process.env.NEXT_PUBLIC_REALTYFLOW_URL,
) {
  const configured = safeOrigin(configuredOrigin);
  if (configured) return configured;

  const request = safeOrigin(requestOrigin);
  if (!request) return DEFAULT_REALTYFLOW_ORIGIN;

  try {
    const hostname = new URL(request).hostname.toLowerCase();
    if (hostname.endsWith(".vercel.app")) return DEFAULT_REALTYFLOW_ORIGIN;
  } catch {
    return DEFAULT_REALTYFLOW_ORIGIN;
  }

  return request;
}
