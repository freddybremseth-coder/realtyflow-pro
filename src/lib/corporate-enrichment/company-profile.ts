type EnrichmentRow = {
  provider?: string | null;
  data_kind?: string | null;
  payload?: unknown;
  fetched_at?: string | null;
  source_url?: string | null;
};

type ProspectLike = {
  company_name?: string | null;
  organization_number?: string | null;
  city?: string | null;
  employee_count?: number | null;
  website_url?: string | null;
  source_url?: string | null;
  evidence?: unknown;
};

export type CorporateProfileField = {
  value: string;
  label?: string;
  sources: string[];
  verified: boolean;
  main?: boolean;
};

export type CorporatePublicRole = {
  name: string;
  title: string;
  sources: string[];
  verified: boolean;
  sourceUrl: string | null;
};

export type CorporateEnrichmentProfile = {
  legalName: string | null;
  organizationNumber: string | null;
  address: CorporateProfileField | null;
  phones: CorporateProfileField[];
  emails: CorporateProfileField[];
  websites: CorporateProfileField[];
  employees: { value: number; sources: string[]; verified: boolean } | null;
  publicRoles: CorporatePublicRole[];
  providerStatus: {
    api1881: { fetchedAt: string | null; available: boolean };
    brreg: { fetchedAt: string | null; available: boolean };
  };
};

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
}

function phoneKey(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : digits;
}

function emailKey(value: string) {
  return value.trim().toLowerCase();
}

function newest(rows: EnrichmentRow[], provider: string) {
  return rows.find(row => row.provider === provider) || null;
}

function mergeFields(items: CorporateProfileField[], keyFn: (value: string) => string) {
  const map = new Map<string, CorporateProfileField>();
  for (const item of items) {
    if (!item.value) continue;
    const key = keyFn(item.value);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item, sources: [...new Set(item.sources)], verified: new Set(item.sources).size > 1 });
      continue;
    }
    const sources = [...new Set([...existing.sources, ...item.sources])];
    map.set(key, {
      ...existing,
      label: existing.label || item.label,
      main: existing.main || item.main,
      sources,
      verified: sources.length > 1,
    });
  }
  return [...map.values()];
}

function brregAddress(entity: Record<string, any> | null) {
  const address = asRecord(entity?.forretningsadresse) || asRecord(entity?.postadresse);
  if (!address) return "";
  const lines = array(address.adresse).map(text).filter(Boolean);
  const postal = [text(address.postnummer), text(address.poststed)].filter(Boolean).join(" ");
  return [...lines, postal].filter(Boolean).join(", ");
}

function storedBrregAddress(evidence: Record<string, any> | null) {
  const address = asRecord(evidence?.business_address);
  if (!address) return "";
  const lines = array(address.adresse).map(text).filter(Boolean);
  const postal = [text(address.postnummer), text(address.poststed)].filter(Boolean).join(" ");
  return [...lines, postal].filter(Boolean).join(", ");
}

function evidenceIsBrreg(evidence: Record<string, any> | null) {
  return text(evidence?.provider).toLowerCase().includes("brønnøysund");
}

function brregRoleRows(payload: Record<string, any> | null) {
  const result: CorporatePublicRole[] = [];
  const rolePayload = asRecord(payload?.roles) || payload;
  for (const group of array(rolePayload?.rollegrupper)) {
    for (const role of array(group?.roller)) {
      if (role?.avregistrert === true) continue;
      const person = asRecord(role?.person);
      if (!person || person.erDoed === true) continue;
      const nameObj = asRecord(person.navn);
      const name = [
        text(nameObj?.fornavn),
        text(nameObj?.mellomnavn),
        text(nameObj?.etternavn),
      ].filter(Boolean).join(" ");
      const title = text(role?.type?.beskrivelse);
      if (!name || !title) continue;
      result.push({
        name,
        title,
        sources: ["Brønnøysund"],
        verified: false,
        sourceUrl: null,
      });
    }
  }
  return result;
}

function api1881Contact(payload: Record<string, any> | null) {
  return asRecord(array(payload?.contacts)[0]);
}

function api1881Roles(contact: Record<string, any> | null) {
  const infoUrl = text(contact?.infoUrl) || null;
  return array(contact?.roles)
    .filter(role => role?.type === "Person" && text(role?.name) && text(role?.role))
    .map(role => ({
      name: text(role.name),
      title: text(role.role),
      sources: ["1881"],
      verified: false,
      sourceUrl: infoUrl,
    } satisfies CorporatePublicRole));
}

function mergeRoles(items: CorporatePublicRole[], orgNumber: string | null) {
  const map = new Map<string, CorporatePublicRole>();
  for (const item of items) {
    const key = `${normalized(item.name)}::${normalized(item.title)}`;
    if (!key || key === "::") continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    const sources = [...new Set([...existing.sources, ...item.sources])];
    map.set(key, {
      ...existing,
      sources,
      verified: sources.length > 1,
      sourceUrl: existing.sourceUrl || item.sourceUrl,
    });
  }

  const rolePriority = (role: CorporatePublicRole) => {
    const title = role.title.toLowerCase();
    if (title.includes("daglig leder")) return 0;
    if (title.includes("kontaktperson")) return 1;
    if (title.includes("styrets leder") || title.includes("styreleder")) return 2;
    if (title.includes("styremedlem")) return 3;
    return 4;
  };

  return [...map.values()]
    .map(role => ({
      ...role,
      sourceUrl: role.sourceUrl || (role.sources.includes("Brønnøysund") && orgNumber
        ? `https://data.brreg.no/enhetsregisteret/api/enheter/${orgNumber}/roller`
        : null),
    }))
    .sort((a, b) => rolePriority(a) - rolePriority(b) || a.name.localeCompare(b.name, "nb"));
}

export function buildCorporateEnrichmentProfile(
  prospect: ProspectLike,
  rows: EnrichmentRow[],
): CorporateEnrichmentProfile {
  const apiRow = newest(rows, "api1881");
  const brregRow = newest(rows, "brreg");
  const apiPayload = asRecord(apiRow?.payload);
  const brregPayload = asRecord(brregRow?.payload);
  const prospectEvidence = asRecord(prospect.evidence);
  const contact = api1881Contact(apiPayload);
  const entity = asRecord(brregPayload?.entity);

  const phones: CorporateProfileField[] = [];
  const emails: CorporateProfileField[] = [];
  const websites: CorporateProfileField[] = [];

  for (const point of array(contact?.contactPoints)) {
    const value = text(point?.value);
    if (!value) continue;
    const type = text(point?.type).toLowerCase();
    const field = {
      value,
      label: text(point?.label) || undefined,
      sources: ["1881"],
      verified: false,
      main: point?.main === true,
    };
    if (type === "phone") phones.push(field);
    else if (type === "email") emails.push(field);
    else if (type === "webaddress") websites.push(field);
  }

  for (const [value, label] of [
    [text(entity?.telefon), "Telefon"],
    [text(entity?.mobil), "Mobil"],
  ] as Array<[string, string]>) {
    if (value) phones.push({ value, label, sources: ["Brønnøysund"], verified: false });
  }
  const brregEmail = text(entity?.epostadresse);
  const brregWebsite = text(entity?.hjemmeside);
  if (brregEmail) emails.push({ value: brregEmail, label: "E-post", sources: ["Brønnøysund"], verified: false });
  if (brregWebsite) websites.push({ value: brregWebsite, label: "Hjemmeside", sources: ["Brønnøysund"], verified: false });

  const storedCompanyContact = asRecord(prospectEvidence?.generic_company_contact);
  const storedGenericEmail = text(storedCompanyContact?.generic_email);
  if (storedGenericEmail) {
    emails.push({ value: storedGenericEmail, label: "Generell e-post", sources: ["Bedriftens nettsted"], verified: false });
  }
  if (text(prospect.website_url)) websites.push({ value: text(prospect.website_url), label: "RealtyFlow", sources: ["RealtyFlow"], verified: false });

  const addressCandidates: CorporateProfileField[] = [];
  const apiAddress = text(contact?.geography?.address?.addressString) || text(contact?.legalInformation?.address?.addressString);
  if (apiAddress) addressCandidates.push({ value: apiAddress, sources: ["1881"], verified: false });
  const brAddress = brregAddress(entity);
  if (brAddress) addressCandidates.push({ value: brAddress, sources: ["Brønnøysund"], verified: false });
  const storedAddress = storedBrregAddress(prospectEvidence);
  if (storedAddress && evidenceIsBrreg(prospectEvidence)) {
    addressCandidates.push({ value: storedAddress, sources: ["Brønnøysund"], verified: false });
  }
  const mergedAddresses = mergeFields(addressCandidates, normalized);

  const storedEmployeeSource = evidenceIsBrreg(prospectEvidence) && prospectEvidence?.has_registered_employee_count === true
    ? "Brønnøysund"
    : "RealtyFlow";
  const employeeCandidates = [
    contact?.legalInformation?.employees != null ? { value: Number(contact.legalInformation.employees), source: "1881" } : null,
    entity?.antallAnsatte != null ? { value: Number(entity.antallAnsatte), source: "Brønnøysund" } : null,
    prospect.employee_count != null ? { value: Number(prospect.employee_count), source: storedEmployeeSource } : null,
  ].filter(Boolean) as Array<{ value: number; source: string }>;
  const employeeValue = employeeCandidates.find(item => Number.isFinite(item.value))?.value ?? null;
  const employeeSources = employeeValue == null
    ? []
    : employeeCandidates.filter(item => item.value === employeeValue).map(item => item.source);

  const orgNumber = text(contact?.organizationNumber) || text(entity?.organisasjonsnummer) || text(prospect.organization_number) || null;
  const legalName = text(contact?.legalInformation?.legalName) || text(entity?.navn) || text(prospect.company_name) || null;

  return {
    legalName,
    organizationNumber: orgNumber,
    address: mergedAddresses[0] || null,
    phones: mergeFields(phones, phoneKey).sort((a, b) => Number(Boolean(b.main)) - Number(Boolean(a.main))),
    emails: mergeFields(emails, emailKey),
    websites: mergeFields(websites, normalized),
    employees: employeeValue == null ? null : {
      value: employeeValue,
      sources: [...new Set(employeeSources)],
      verified: new Set(employeeSources).size > 1,
    },
    publicRoles: mergeRoles([
      ...api1881Roles(contact),
      ...brregRoleRows(brregPayload),
    ], orgNumber),
    providerStatus: {
      api1881: { fetchedAt: apiRow?.fetched_at || null, available: Boolean(apiRow) },
      brreg: { fetchedAt: brregRow?.fetched_at || null, available: Boolean(brregRow) },
    },
  };
}
