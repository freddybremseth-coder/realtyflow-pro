/**
 * DemoSites domains.
 *
 * The application is hosted on Vercel. Hostinger manages the authoritative
 * DNS zone for chatgenius.pro. Paid sites can therefore use either:
 *
 *  - <slug>.chatgenius.pro: Vercel project domain + Hostinger CNAME
 *  - a customer-owned domain: Vercel project domain + DNS instructions for
 *    the customer's registrar. The browser keeps the customer's own URL.
 */

const ROOT_DOMAIN = process.env.DEMOSITES_ROOT_DOMAIN || "chatgenius.pro";
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_qh1E3bxf4B4rDWO9WD8pcy8VCoGo";
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || "team_XggNkgEJvnbAunPA9w7BnIxT";
const FALLBACK_VERCEL_CNAME = process.env.VERCEL_CNAME_TARGET || "cname.vercel-dns-0.com";
const FALLBACK_VERCEL_IPV4 = process.env.VERCEL_APEX_IPV4 || "76.76.21.21";

const RESERVED_SUBDOMAINS = new Set([
  "www", "api", "mail", "smtp", "imap", "pop", "ftp", "webmail",
  "realtyflow", "appointment", "sider", "app", "admin", "portal",
  "demo", "demosites", "status", "cdn", "static", "ns1", "ns2",
]);

export type DomainVerification = {
  type?: string;
  domain?: string;
  value?: string;
  reason?: string;
};

export type DomainDnsRecord = {
  type: "A" | "CNAME" | "TXT";
  name: string;
  value: string;
  purpose: string;
};

export type DomainProvisionResult = {
  ok: boolean;
  domain?: string;
  url?: string;
  configured?: boolean;
  verified?: boolean;
  dnsRecords?: DomainDnsRecord[];
  verification?: DomainVerification[];
  error?: string;
};

export type DomainInfrastructureStatus = {
  vercelConfigured: boolean;
  hostingerConfigured: boolean;
  rootDomain: string;
  vercelProjectId: string;
};

export function getDomainInfrastructureStatus(): DomainInfrastructureStatus {
  return {
    vercelConfigured: Boolean(process.env.VERCEL_TOKEN),
    hostingerConfigured: Boolean(process.env.HOSTINGER_API_TOKEN),
    rootDomain: ROOT_DOMAIN,
    vercelProjectId: VERCEL_PROJECT_ID,
  };
}

export function isSubdomainProvisioningConfigured(): boolean {
  return Boolean(process.env.VERCEL_TOKEN && process.env.HOSTINGER_API_TOKEN);
}

export function isReservedSubdomain(slug: string): boolean {
  return RESERVED_SUBDOMAINS.has(slug.toLowerCase());
}

export function buildSubdomainUrl(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`;
}

export function normalizeCustomerDomain(value: unknown): string | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.replace(/^\.+|\.+$/g, "");
    if (!host.includes(".") || host.includes("*") || host === "localhost") return null;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
    if (!/^[a-z0-9.-]+$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export function buildFallbackDnsRecords(domain: string): DomainDnsRecord[] {
  const isWww = domain.startsWith("www.");
  return isWww
    ? [{ type: "CNAME", name: "www", value: FALLBACK_VERCEL_CNAME, purpose: "Peker kundedomenet til Vercel" }]
    : [{ type: "A", name: "@", value: FALLBACK_VERCEL_IPV4, purpose: "Peker rotdomenet til Vercel" }];
}

function vercelHeaders() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN || ""}`,
    "Content-Type": "application/json",
  };
}

function recommendationValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const candidate = String(record.value || record.content || record.target || "").trim();
        if (candidate) return candidate;
      }
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate = String(record.value || record.content || record.target || "").trim();
    if (candidate) return candidate;
  }
  return fallback;
}

async function addDomainToVercelProject(domain: string): Promise<DomainProvisionResult> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return { ok: false, error: "VERCEL_TOKEN missing" };

  const res = await fetch(
    `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`,
    {
      method: "POST",
      headers: vercelHeaders(),
      body: JSON.stringify({ name: domain }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    verified?: boolean;
    verification?: DomainVerification[];
    error?: { code?: string; message?: string };
  };

  if (res.ok) {
    return {
      ok: true,
      domain,
      verified: data.verified !== false,
      verification: Array.isArray(data.verification) ? data.verification : [],
    };
  }

  const message = data.error?.message || `Vercel domain add failed (HTTP ${res.status})`;
  if (/already.*project|already assigned to this project/i.test(message)) {
    return { ok: true, domain };
  }
  return { ok: false, error: message };
}

export async function inspectVercelDomain(domainValue: unknown): Promise<DomainProvisionResult> {
  const domain = normalizeCustomerDomain(domainValue);
  const token = process.env.VERCEL_TOKEN;
  if (!domain) return { ok: false, error: "Ugyldig domene." };
  if (!token) return { ok: false, error: "VERCEL_TOKEN missing" };

  const res = await fetch(
    `https://api.vercel.com/v6/domains/${encodeURIComponent(domain)}/config?teamId=${VERCEL_TEAM_ID}`,
    { headers: vercelHeaders(), signal: AbortSignal.timeout(20_000), cache: "no-store" },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    misconfigured?: boolean;
    error?: { message?: string };
  };
  if (!res.ok) return { ok: false, domain, error: data.error?.message || `Vercel domain check failed (HTTP ${res.status})` };

  const isWww = domain.startsWith("www.");
  const target = isWww
    ? recommendationValue(data.recommendedCNAME, FALLBACK_VERCEL_CNAME)
    : recommendationValue(data.recommendedIPv4, FALLBACK_VERCEL_IPV4);
  return {
    ok: true,
    domain,
    url: `https://${domain}`,
    configured: data.misconfigured === false,
    dnsRecords: [{
      type: isWww ? "CNAME" : "A",
      name: isWww ? "www" : "@",
      value: target,
      purpose: "Peker kundedomenet direkte til DemoSites på Vercel",
    }],
  };
}

async function addCnameAtHostinger(slug: string, target: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.HOSTINGER_API_TOKEN;
  if (!token) return { ok: false, error: "HOSTINGER_API_TOKEN missing" };

  const res = await fetch(`https://developers.hostinger.com/api/dns/v1/zones/${ROOT_DOMAIN}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      overwrite: false,
      zone: [{ name: slug, type: "CNAME", ttl: 300, records: [{ content: target }] }],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.ok) return { ok: true };
  const responseText = await res.text().catch(() => "");
  if (/exist/i.test(responseText)) return { ok: true };
  return { ok: false, error: `Hostinger DNS failed (HTTP ${res.status}): ${responseText.slice(0, 200)}` };
}

export async function provisionCustomerSubdomain(slug: string): Promise<DomainProvisionResult> {
  const cleanSlug = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(cleanSlug)) return { ok: false, error: `Ugyldig subdomene-slug: ${slug}` };
  if (isReservedSubdomain(cleanSlug)) return { ok: false, error: `Subdomenet ${cleanSlug} er reservert.` };
  if (!isSubdomainProvisioningConfigured()) return { ok: false, error: "VERCEL_TOKEN/HOSTINGER_API_TOKEN er ikke konfigurert." };

  const domain = `${cleanSlug}.${ROOT_DOMAIN}`;
  const vercel = await addDomainToVercelProject(domain).catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : "Vercel error" }));
  if (!vercel.ok) return vercel;

  const inspected = await inspectVercelDomain(domain).catch(() => ({ ok: true, dnsRecords: buildFallbackDnsRecords(`www.${ROOT_DOMAIN}`) } as DomainProvisionResult));
  const cnameTarget = inspected.dnsRecords?.find((record) => record.type === "CNAME")?.value || FALLBACK_VERCEL_CNAME;
  const dns = await addCnameAtHostinger(cleanSlug, cnameTarget).catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : "Hostinger error" }));
  if (!dns.ok) return { ok: false, domain, error: dns.error };

  return { ok: true, domain, url: `https://${domain}`, configured: true, verified: vercel.verified, dnsRecords: [{ type: "CNAME", name: cleanSlug, value: cnameTarget, purpose: "ChatGenius-subdomene" }] };
}

export async function provisionCustomerCustomDomain(domainValue: unknown): Promise<DomainProvisionResult> {
  const domain = normalizeCustomerDomain(domainValue);
  if (!domain) return { ok: false, error: "Ugyldig kundedomene." };
  if (domain === ROOT_DOMAIN || domain.endsWith(`.${ROOT_DOMAIN}`)) return { ok: false, error: "Bruk den automatiske ChatGenius-subdomene-flyten for chatgenius.pro." };

  const added = await addDomainToVercelProject(domain).catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : "Vercel error" }));
  if (!added.ok) return added;
  const inspected = await inspectVercelDomain(domain);
  if (!inspected.ok) return { ...added, dnsRecords: buildFallbackDnsRecords(domain), configured: false };
  return {
    ...inspected,
    verified: added.verified,
    verification: added.verification,
    dnsRecords: [
      ...(added.verification || []).map((item) => ({ type: "TXT" as const, name: item.domain || "@", value: item.value || "", purpose: item.reason || "Bekreft domeneeierskap" })).filter((item) => item.value),
      ...(inspected.dnsRecords || buildFallbackDnsRecords(domain)),
    ],
  };
}
