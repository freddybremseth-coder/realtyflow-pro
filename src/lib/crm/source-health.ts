import { normalizeCrmSource, type CrmSourceType, type NormalizedCrmSource } from "./source-normalization";

export interface SourceHealthContact {
  id: string;
  source?: string | null;
}

export interface SourceHealthGroup extends NormalizedCrmSource {
  contacts: number;
  rawVariants: string[];
}

export interface SourceHealthSummary {
  total: number;
  acquisitionChannelKnown: number;
  acquisitionChannelUnknown: number;
  legacyCrm: number;
  brandSourceOnly: number;
  manual: number;
  normalizedGroups: number;
  rawVariants: number;
}

export function buildSourceHealth(contacts: SourceHealthContact[]) {
  const groups = new Map<string, SourceHealthGroup>();

  for (const contact of contacts) {
    const normalized = normalizeCrmSource(contact.source);
    const key = `${normalized.sourceType}:${normalized.sourceDetail}`;
    const current = groups.get(key);
    if (current) {
      current.contacts += 1;
      if (normalized.rawSource && !current.rawVariants.includes(normalized.rawSource)) current.rawVariants.push(normalized.rawSource);
      continue;
    }
    groups.set(key, {
      ...normalized,
      contacts: 1,
      rawVariants: normalized.rawSource ? [normalized.rawSource] : [],
    });
  }

  const rows = [...groups.values()].sort((a, b) => b.contacts - a.contacts || a.sourceDetail.localeCompare(b.sourceDetail));
  const countType = (type: CrmSourceType) => rows.filter((row) => row.sourceType === type).reduce((sum, row) => sum + row.contacts, 0);
  const acquisitionChannelKnown = rows.filter((row) => row.acquisitionChannelKnown).reduce((sum, row) => sum + row.contacts, 0);

  const summary: SourceHealthSummary = {
    total: contacts.length,
    acquisitionChannelKnown,
    acquisitionChannelUnknown: contacts.length - acquisitionChannelKnown,
    legacyCrm: countType("legacy_crm"),
    brandSourceOnly: countType("brand_source"),
    manual: countType("manual"),
    normalizedGroups: rows.length,
    rawVariants: rows.reduce((sum, row) => sum + row.rawVariants.length, 0),
  };

  const recommendations: string[] = [];
  if (summary.legacyCrm > 0) recommendations.push("Legacy CRM provenance should not be reported as a marketing event. Backfill acquisition channel only when documented evidence exists.");
  if (summary.brandSourceOnly > 0) recommendations.push("Brand provenance identifies relationship/source brand, not necessarily the original acquisition channel.");
  if (summary.manual > 0) recommendations.push("Manual entries should retain their raw source while acquisition remains unknown unless separately documented.");
  if (summary.acquisitionChannelUnknown > 0) recommendations.push("Keep unknown acquisition explicit rather than inventing attribution. Improve future forms/UTM capture at intake.");

  return { summary, groups: rows, recommendations };
}
