/**
 * Read-only, bounded CORS preflight checks for the fixed public SEO portfolio.
 * OPTIONS does not create visits, CRM leads, cookies, attribution events or
 * Google clicks. Passing here proves ONLY collector origin policy for the
 * given public site; browser execution, CSP and real arrival storage remain
 * separate checks.
 */
import { SEO_AUDIT_TARGETS } from "./seo-audit";

const COLLECTOR = "https://realtyflow.chatgenius.pro/api/public/search-discovery";
export type ReferralPreflightCheck = {
  brandId: string;
  status: "pass" | "blocked" | "unknown";
  evidence: string;
};

export async function checkReferralCollectorPreflight(
  fetcher: typeof fetch = fetch,
): Promise<ReferralPreflightCheck[]> {
  return Promise.all(SEO_AUDIT_TARGETS.map(async target => {
    const origin = new URL(target.base).origin;
    try {
      const response = await fetcher(COLLECTOR, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(2500),
      });
      const allowOrigin = response.headers.get("access-control-allow-origin");
      const methods = response.headers.get("access-control-allow-methods") || "";
      const headers = response.headers.get("access-control-allow-headers") || "";
      const allowed = response.status === 204 && allowOrigin === origin &&
        methods.split(",").some(value => value.trim().toUpperCase() === "POST") &&
        headers.split(",").some(value => value.trim().toLowerCase() === "content-type");
      return {
        brandId: target.brandId,
        status: allowed ? "pass" as const : "blocked" as const,
        evidence: allowed
          ? "HTTP 204, exact Access-Control-Allow-Origin, POST and Content-Type accepted."
          : "OPTIONS HTTP " + response.status + "; exact-origin or POST/Content-Type CORS admission not confirmed.",
      };
    } catch {
      // A network error may be a crawler/server-to-server reachability issue.
      // Do not claim the browser is blocked without observing browser traffic.
      return { brandId: target.brandId, status: "unknown" as const,
        evidence: "OPTIONS unavailable from the server; no conclusion about real browser traffic." };
    }
  }));
}
