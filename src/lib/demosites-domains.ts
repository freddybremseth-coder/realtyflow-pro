/**
 * Automatic customer subdomains — <slug>.chatgenius.pro.
 *
 * The chatgenius.pro DNS zone lives at Hostinger and the app runs on
 * Vercel, so publishing a paid site provisions two things automatically:
 *
 *   1. Vercel:    adds <slug>.chatgenius.pro as a domain on this project
 *                 (TLS certificate is issued automatically)
 *   2. Hostinger: creates the CNAME record <slug> → cname.vercel-dns.com
 *                 via their public DNS API (developers.hostinger.com)
 *
 * Host-based routing in src/middleware.ts then rewrites requests for the
 * subdomain to /sites/<slug>. Everything is feature-flagged on the env
 * vars below — without them, publishing falls back to the /sites path
 * URL and nothing breaks.
 *
 * Required env:
 *   VERCEL_TOKEN           (account token with access to the project)
 *   HOSTINGER_API_TOKEN    (Hostinger → API tokens)
 * Optional env:
 *   DEMOSITES_ROOT_DOMAIN  (default chatgenius.pro)
 *   VERCEL_PROJECT_ID / VERCEL_TEAM_ID (defaults to this project)
 */

const ROOT_DOMAIN = process.env.DEMOSITES_ROOT_DOMAIN || "chatgenius.pro";
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_qh1E3bxf4B4rDWO9WD8pcy8VCoGo";
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || "team_XggNkgEJvnbAunPA9w7BnIxT";
const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

/** Subdomains that must never be claimed by a customer site. */
const RESERVED_SUBDOMAINS = new Set([
  "www", "api", "mail", "smtp", "imap", "pop", "ftp", "webmail",
  "realtyflow", "appointment", "sider", "app", "admin", "portal",
  "demo", "demosites", "status", "cdn", "static", "ns1", "ns2",
]);

export function isSubdomainProvisioningConfigured(): boolean {
  return Boolean(process.env.VERCEL_TOKEN && process.env.HOSTINGER_API_TOKEN);
}

export function isReservedSubdomain(slug: string): boolean {
  return RESERVED_SUBDOMAINS.has(slug.toLowerCase());
}

export function buildSubdomainUrl(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`;
}

async function addDomainToVercelProject(domain: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return { ok: false, error: "VERCEL_TOKEN missing" };

  const res = await fetch(
    `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: domain }),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  // Already attached to this project — treat as success (idempotent republish).
  if (data.error?.code === "domain_already_in_use" || /already/i.test(data.error?.message || "")) {
    return { ok: true };
  }
  return { ok: false, error: data.error?.message || `Vercel domain add failed (HTTP ${res.status})` };
}

async function addCnameAtHostinger(slug: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.HOSTINGER_API_TOKEN;
  if (!token) return { ok: false, error: "HOSTINGER_API_TOKEN missing" };

  // Hostinger DNS API: PUT updates the zone; overwrite=false merges the new
  // record set into the existing zone instead of replacing it.
  const res = await fetch(`https://developers.hostinger.com/api/dns/v1/zones/${ROOT_DOMAIN}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      overwrite: false,
      zone: [
        {
          name: slug,
          type: "CNAME",
          ttl: 300,
          records: [{ content: `${VERCEL_CNAME_TARGET}` }],
        },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (res.ok) return { ok: true };
  const text = await res.text().catch(() => "");
  // An identical existing record is fine — republish stays idempotent.
  if (/exist/i.test(text)) return { ok: true };
  return { ok: false, error: `Hostinger DNS failed (HTTP ${res.status}): ${text.slice(0, 200)}` };
}

export type SubdomainProvisionResult = {
  ok: boolean;
  domain?: string;
  url?: string;
  error?: string;
};

/**
 * Provision <slug>.chatgenius.pro end to end. Never throws — the caller
 * falls back to the /sites path URL when this reports failure.
 */
export async function provisionCustomerSubdomain(slug: string): Promise<SubdomainProvisionResult> {
  const cleanSlug = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(cleanSlug)) {
    return { ok: false, error: `Ugyldig subdomene-slug: ${slug}` };
  }
  if (isReservedSubdomain(cleanSlug)) {
    return { ok: false, error: `Subdomenet ${cleanSlug} er reservert.` };
  }
  if (!isSubdomainProvisioningConfigured()) {
    return { ok: false, error: "VERCEL_TOKEN/HOSTINGER_API_TOKEN er ikke konfigurert." };
  }

  const domain = `${cleanSlug}.${ROOT_DOMAIN}`;

  const vercel = await addDomainToVercelProject(domain).catch((err) => ({
    ok: false as const,
    error: err instanceof Error ? err.message : "Vercel error",
  }));
  if (!vercel.ok) return { ok: false, error: vercel.error };

  const dns = await addCnameAtHostinger(cleanSlug).catch((err) => ({
    ok: false as const,
    error: err instanceof Error ? err.message : "Hostinger error",
  }));
  if (!dns.ok) return { ok: false, error: dns.error };

  return { ok: true, domain, url: `https://${domain}` };
}
