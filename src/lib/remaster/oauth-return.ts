export const REMASTER_OAUTH_RETURN_PATH = "/oauth/remaster-return";

const DEFAULT_REMASTER_ADMIN_URL = "https://remaster.freddybremseth.com/admin";
const FORWARDED_OAUTH_PARAMS = [
  "oauth_success",
  "oauth_error",
  "platform",
  "brand",
  "count",
] as const;

export function isRemasterBrand(brandId: string) {
  const normalized = brandId.toLowerCase().replace(/[-_.\s]/g, "");
  return normalized === "remasterfreddy" || normalized === "neuralbeat";
}

export function resolveRemasterAdminUrl(configuredUrl?: string | null) {
  const candidate = configuredUrl?.trim() || DEFAULT_REMASTER_ADMIN_URL;

  try {
    const url = new URL(candidate);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.toString();
    }
  } catch {
    // Fall through to the known production URL.
  }

  return DEFAULT_REMASTER_ADMIN_URL;
}

export function remasterAdminUrl() {
  return resolveRemasterAdminUrl(
    process.env.REMASTER_ADMIN_URL || process.env.NEXT_PUBLIC_REMASTER_ADMIN_URL,
  );
}

export function remasterOAuthRedirectUrl(
  requestUrl: string | URL,
  adminUrl = remasterAdminUrl(),
) {
  const source = new URL(requestUrl);
  const target = new URL(resolveRemasterAdminUrl(adminUrl));

  for (const key of FORWARDED_OAUTH_PARAMS) {
    const value = source.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }

  return target;
}
