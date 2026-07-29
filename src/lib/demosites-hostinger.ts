export type DemoSiteHostingerOrder = {
  id: string;
  order_number?: string | null;
  company_name: string;
  customer_name?: string | null;
  customer_email?: string | null;
  industry?: string | null;
  website_url?: string | null;
  template_slug?: string | null;
  target_subdomain?: string | null;
  preview_url?: string | null;
  production_url?: string | null;
  editable_fields?: Record<string, unknown> | null;
};

export type HostingerProvisioningMode = "agency" | "hosting" | "horizons";

export type HostingerProvisioningResult = {
  status: "created" | "queued" | "skipped" | "failed";
  provider: "hostinger";
  mode?: HostingerProvisioningMode;
  message: string;
  production_url?: string;
  external_id?: string;
  metadata?: Record<string, unknown>;
};

type EnvLike = Record<string, string | undefined>;
type FetchLike = typeof fetch;

const DEFAULT_HOSTINGER_BASE_URL = "https://developers.hostinger.com";

function cleanEnvValue(value: string | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed || undefined;
}

function getHostingerBaseUrl(env: EnvLike) {
  return cleanEnvValue(env.HOSTINGER_API_BASE_URL) || DEFAULT_HOSTINGER_BASE_URL;
}

function getHostingerMode(env: EnvLike): HostingerProvisioningMode | null {
  const mode = cleanEnvValue(env.HOSTINGER_PROVISIONING_MODE)?.toLowerCase();
  if (mode === "agency" || mode === "hosting" || mode === "horizons") return mode;
  if (cleanEnvValue(env.HOSTINGER_AGENCY_ORDER_ID)) return "agency";
  if (cleanEnvValue(env.HOSTINGER_ORDER_ID)) return "hosting";
  if (cleanEnvValue(env.HOSTINGER_HORIZONS_ENABLED) === "true") return "horizons";
  return null;
}

function normalizeDomain(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  }
}

function isHostingerCompatibleDomain(value: string) {
  if (!value) return false;
  if (value.includes("*")) return false;
  if (value === "localhost" || value.endsWith(".localhost")) return false;
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(value);
}

function orderDomain(order: DemoSiteHostingerOrder, env: EnvLike) {
  const configuredDomain = cleanEnvValue(env.HOSTINGER_DEMOSITE_DOMAIN);
  if (configuredDomain) return normalizeDomain(configuredDomain);

  const target = normalizeDomain(order.target_subdomain || order.production_url || "");
  if (isHostingerCompatibleDomain(target)) return target;
  return "";
}

function asStringList(value: unknown, maxItems: number) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : ""))
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, maxItems);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, maxItems);
  }
  return [];
}

function buildHorizonsPrompt(order: DemoSiteHostingerOrder) {
  const fields = order.editable_fields || {};
  const services = asStringList(fields.services, 8).join(", ");
  const products = asStringList(fields.products, 8).join(", ");
  const prices = asStringList(fields.prices, 8).join(", ");
  const trustPoints = asStringList(fields.trust_points, 6).join(", ");
  const colors = [fields.brand_color, fields.secondary_color, fields.accent_color].filter(Boolean).join(", ");

  return [
    `Lag en moderne 2026 business-nettside for ${order.company_name}.`,
    order.industry ? `Bransje: ${order.industry}.` : "",
    order.template_slug ? `DemoSites-mal: ${order.template_slug}.` : "",
    fields.hero_title ? `Hero-tittel: ${fields.hero_title}.` : "",
    fields.hero_subtitle ? `Hero-undertittel: ${fields.hero_subtitle}.` : "",
    fields.intro_text ? `Intro: ${fields.intro_text}.` : "",
    services ? `Tjenester: ${services}.` : "",
    products ? `Produkter/pakker: ${products}.` : "",
    prices ? `Priser: ${prices}.` : "",
    trustPoints ? `Tillitspunkter: ${trustPoints}.` : "",
    fields.call_to_action ? `CTA: ${fields.call_to_action}.` : "",
    fields.contact_text ? `Kontakttekst: ${fields.contact_text}.` : "",
    colors ? `Bruk disse fargene som utgangspunkt: ${colors}.` : "",
    order.preview_url ? `Intern RealtyFlow-preview finnes her: ${order.preview_url}.` : "",
    "Stilen skal være profesjonell, skarp, rask på mobil, med tydelige seksjoner for tjenester, priser, FAQ og kontakt.",
    "Ikke send e-post eller kontakt kunden automatisk.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function readHostingerJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text.slice(0, 1000) };
  }
}

async function postHostinger(fetchFn: FetchLike, env: EnvLike, path: string, payload: Record<string, unknown>) {
  const token = cleanEnvValue(env.HOSTINGER_API_TOKEN);
  if (!token) {
    return {
      ok: false,
      status: 0,
      data: {},
      message: "Hostinger API-nøkkel mangler. Legg inn HOSTINGER_API_TOKEN før automatisk publisering kan kjøres.",
    };
  }

  const response = await fetchFn(`${getHostingerBaseUrl(env)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await readHostingerJson(response);
  const message = typeof data.message === "string" ? data.message : response.statusText;
  return { ok: response.ok, status: response.status, data, message };
}

export async function provisionDemoSiteOnHostinger(
  order: DemoSiteHostingerOrder,
  env: EnvLike = process.env,
  fetchFn: FetchLike = fetch,
): Promise<HostingerProvisioningResult> {
  const token = cleanEnvValue(env.HOSTINGER_API_TOKEN);
  if (!token) {
    return {
      status: "skipped",
      provider: "hostinger",
      message: "Hostinger API-nøkkel mangler. Betalingen er registrert, men automatisk Hostinger-oppretting venter på konfigurasjon.",
    };
  }

  const mode = getHostingerMode(env);
  if (!mode) {
    return {
      status: "skipped",
      provider: "hostinger",
      message: "Hostinger-modus er ikke satt. Bruk HOSTINGER_PROVISIONING_MODE=agency, hosting eller horizons.",
    };
  }

  if (mode === "agency") {
    const orderId = cleanEnvValue(env.HOSTINGER_AGENCY_ORDER_ID);
    const datacenterCode = cleanEnvValue(env.HOSTINGER_DATACENTER_CODE);
    if (!orderId || !datacenterCode) {
      return {
        status: "skipped",
        provider: "hostinger",
        mode,
        message: "Hostinger Agency mangler HOSTINGER_AGENCY_ORDER_ID eller HOSTINGER_DATACENTER_CODE.",
      };
    }

    const attachDomain = cleanEnvValue(env.HOSTINGER_ATTACH_TARGET_DOMAIN) === "true";
    const domain = attachDomain ? orderDomain(order, env) : "";
    const payload: Record<string, unknown> = {
      datacenter_code: datacenterCode,
      flavor: cleanEnvValue(env.HOSTINGER_AGENCY_FLAVOR) || "php-fpm",
      settings: { php: { version: cleanEnvValue(env.HOSTINGER_PHP_VERSION) || "8.3" } },
      type: "node-static",
    };
    if (domain && isHostingerCompatibleDomain(domain)) payload.domain = domain;

    const response = await postHostinger(fetchFn, env, `/api/agency-hosting/v1/orders/${encodeURIComponent(orderId)}/websites/setups`, payload);
    if (!response.ok) {
      return {
        status: "failed",
        provider: "hostinger",
        mode,
        message: `Hostinger Agency-oppretting feilet: ${response.message || "ukjent feil"}`,
        metadata: { status: response.status, response: response.data },
      };
    }

    const setupUuid = typeof response.data.setup_uuid === "string" ? response.data.setup_uuid : undefined;
    return {
      status: "queued",
      provider: "hostinger",
      mode,
      message: setupUuid
        ? "Hostinger Agency-oppretting er startet. Siden provisioneres asynkront."
        : "Hostinger Agency-oppretting er startet.",
      external_id: setupUuid,
      metadata: { setup_uuid: setupUuid, request: { ...payload, domain: payload.domain || null } },
    };
  }

  if (mode === "hosting") {
    const hostingerOrderId = cleanEnvValue(env.HOSTINGER_ORDER_ID);
    const domain = orderDomain(order, env);
    if (!hostingerOrderId || !domain || !isHostingerCompatibleDomain(domain)) {
      return {
        status: "skipped",
        provider: "hostinger",
        mode,
        message: "Hostinger hosting mangler HOSTINGER_ORDER_ID eller gyldig domenenavn.",
      };
    }

    const payload: Record<string, unknown> = { domain, order_id: Number(hostingerOrderId) };
    const datacenterCode = cleanEnvValue(env.HOSTINGER_DATACENTER_CODE);
    if (datacenterCode) payload.datacenter_code = datacenterCode;

    const response = await postHostinger(fetchFn, env, "/api/hosting/v1/websites", payload);
    if (!response.ok) {
      return {
        status: "failed",
        provider: "hostinger",
        mode,
        message: `Hostinger website-oppretting feilet: ${response.message || "ukjent feil"}`,
        metadata: { status: response.status, response: response.data },
      };
    }

    return {
      status: "queued",
      provider: "hostinger",
      mode,
      message: "Hostinger website-oppretting er startet.",
      production_url: `https://${domain}`,
      metadata: { domain, request: payload },
    };
  }

  const response = await postHostinger(fetchFn, env, "/api/horizons/v1/websites", {
    message: [{ type: "user", text: buildHorizonsPrompt(order) }],
  });
  if (!response.ok) {
    return {
      status: "failed",
      provider: "hostinger",
      mode,
      message: `Hostinger Horizons-oppretting feilet: ${response.message || "ukjent feil"}`,
      metadata: { status: response.status, response: response.data },
    };
  }

  const websiteUrl = typeof response.data.website_url === "string" ? response.data.website_url : undefined;
  const websiteId = typeof response.data.website_id === "string" ? response.data.website_id : undefined;
  return {
    status: websiteUrl ? "created" : "queued",
    provider: "hostinger",
    mode,
    message: websiteUrl ? "Hostinger Horizons-side er opprettet." : "Hostinger Horizons-oppretting er startet.",
    production_url: websiteUrl,
    external_id: websiteId,
    metadata: { website_id: websiteId },
  };
}
