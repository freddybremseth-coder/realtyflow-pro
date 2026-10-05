import "server-only";

const BRREG_BASE = (process.env.BRREG_ENHET_API_BASE_URL || "https://data.brreg.no/enhetsregisteret/api").replace(/\/+$/, "");

function normalizeOrgNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits)) throw new Error("BRREG_ORGNR_REQUIRED");
  return digits;
}

async function brregGet(path: string) {
  const response = await fetch(`${BRREG_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "RealtyFlow Corporate/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 5000) };
  }

  if (!response.ok) {
    const error = new Error(`BRREG_HTTP_${response.status}`);
    (error as Error & { status?: number; body?: unknown }).status = response.status;
    (error as Error & { status?: number; body?: unknown }).body = body;
    throw error;
  }

  return body;
}

export async function fetchBrregCompanySnapshot(orgNumber: string) {
  const orgnr = normalizeOrgNumber(orgNumber);
  const [entity, roles] = await Promise.all([
    brregGet(`/enheter/${encodeURIComponent(orgnr)}`),
    brregGet(`/enheter/${encodeURIComponent(orgnr)}/roller`),
  ]);

  return {
    organizationNumber: orgnr,
    entity,
    roles,
    fetchedAt: new Date().toISOString(),
  };
}

export const BRREG_SOURCE = {
  provider: "brreg",
  baseUrl: BRREG_BASE,
  companyPath: "/enheter/{orgnr}",
  rolesPath: "/enheter/{orgnr}/roller",
  openData: true,
  automaticOutreach: false,
} as const;
