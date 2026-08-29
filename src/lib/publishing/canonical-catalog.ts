export type CanonicalEditionRow = {
  id: string;
  work_id: string;
  edition_key: string;
  title: string;
  subtitle?: string | null;
  language: string;
  format: string;
  status: string;
  canonical_project_id?: string | null;
  canonical_book_id?: string | null;
  canonical_website_title_id?: string | null;
};

export type CanonicalRevisionRow = {
  id: string;
  edition_id: string;
  status: string;
  is_canonical: boolean;
};

export type CanonicalAssetRow = {
  id: string;
  edition_id: string;
  asset_type: string;
  status: string;
  is_canonical: boolean;
};

export type CanonicalIdentifierRow = {
  id: string;
  edition_id: string;
  scheme: string;
  verified: boolean;
};

export type CanonicalPublicationRow = {
  id: string;
  edition_id?: string | null;
  revision_id?: string | null;
  status: string;
};

export type ReconciliationCandidate = {
  id: string;
  source_work_id: string;
  target_work_id: string;
  candidate_type: string;
  confidence: number | string;
  status: string;
  evidence?: { title?: string; reason?: string } | null;
  sourceWork?: { canonical_title?: string | null } | null;
  targetWork?: { canonical_title?: string | null } | null;
};

export function groupReconciliationCandidates<T extends ReconciliationCandidate>(candidates: T[]) {
  const groups = new Map<string, { key: string; title: string; candidates: T[]; workIds: Set<string> }>();
  for (const candidate of candidates) {
    const title = String(candidate.evidence?.title || candidate.sourceWork?.canonical_title || candidate.targetWork?.canonical_title || "Ukjent bok").trim();
    const key = title.toLocaleLowerCase("nb-NO").replace(/\s+/g, " ");
    const group = groups.get(key) ?? { key, title, candidates: [], workIds: new Set<string>() };
    group.candidates.push(candidate);
    group.workIds.add(candidate.source_work_id);
    group.workIds.add(candidate.target_work_id);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    key: group.key,
    title: group.title,
    candidates: group.candidates.sort((a, b) => Number(b.confidence) - Number(a.confidence)),
    workCount: group.workIds.size,
    pendingCount: group.candidates.filter((candidate) => candidate.status === "pending").length,
    approvedCount: group.candidates.filter((candidate) => candidate.status === "approved").length,
  })).sort((a, b) => b.workCount - a.workCount || a.title.localeCompare(b.title, "nb-NO"));
}

export type CanonicalEditionCoverage = CanonicalEditionRow & {
  hasCanonicalRevision: boolean;
  hasEpub: boolean;
  hasCover: boolean;
  hasSample: boolean;
  hasIdentifier: boolean;
  hasPublicationLink: boolean;
  issues: string[];
  score: number;
};

export function canonicalEditionCoverage(
  editions: CanonicalEditionRow[],
  revisions: CanonicalRevisionRow[],
  assets: CanonicalAssetRow[],
  identifiers: CanonicalIdentifierRow[],
  publications: CanonicalPublicationRow[],
): CanonicalEditionCoverage[] {
  const revisionsByEdition = new Set(revisions.filter((row) => row.is_canonical).map((row) => row.edition_id));
  const epubByEdition = new Set(assets.filter((row) => row.asset_type === "epub" && row.is_canonical && row.status !== "retired").map((row) => row.edition_id));
  const coverByEdition = new Set(assets.filter((row) => row.asset_type === "cover" && row.is_canonical && row.status !== "retired").map((row) => row.edition_id));
  const sampleByEdition = new Set(assets.filter((row) => row.asset_type === "sample" && row.is_canonical && row.status !== "retired").map((row) => row.edition_id));
  const identifierByEdition = new Set(identifiers.filter((row) => row.verified).map((row) => row.edition_id));
  const publicationByEdition = new Set(publications.filter((row) => Boolean(row.edition_id)).map((row) => String(row.edition_id)));

  return editions.map((edition) => {
    const issues: string[] = [];
    const hasCanonicalRevision = revisionsByEdition.has(edition.id);
    const hasEpub = epubByEdition.has(edition.id);
    const hasCover = coverByEdition.has(edition.id);
    const hasSample = sampleByEdition.has(edition.id);
    const hasIdentifier = identifierByEdition.has(edition.id);
    const hasPublicationLink = publicationByEdition.has(edition.id);
    if (!hasCanonicalRevision) issues.push("missing_canonical_revision");
    if (!hasEpub) issues.push("missing_epub");
    if (!hasCover) issues.push("missing_cover");
    if (!hasSample) issues.push("missing_sample");
    if (!hasIdentifier) issues.push("missing_identifier");
    if (edition.status === "published" && !hasPublicationLink) issues.push("missing_publication_link");
    const required = edition.status === "published" ? 6 : 5;
    return {
      ...edition,
      hasCanonicalRevision,
      hasEpub,
      hasCover,
      hasSample,
      hasIdentifier,
      hasPublicationLink,
      issues,
      score: Math.round(((required - issues.length) / required) * 100),
    };
  }).sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));
}

export function canonicalCatalogSummary(input: {
  works: Array<{ status: string }>;
  editions: CanonicalEditionRow[];
  revisions: CanonicalRevisionRow[];
  assets: CanonicalAssetRow[];
  identifiers: CanonicalIdentifierRow[];
  publications: CanonicalPublicationRow[];
  sourceLinks: Array<{ verified: boolean }>;
  candidates: Array<{ status: string }>;
}) {
  const coverage = canonicalEditionCoverage(input.editions, input.revisions, input.assets, input.identifiers, input.publications);
  const complete = coverage.filter((row) => row.issues.length === 0).length;
  return {
    works: input.works.filter((row) => row.status !== "archived").length,
    archivedWorks: input.works.filter((row) => row.status === "archived").length,
    editions: input.editions.length,
    canonicalRevisions: input.revisions.filter((row) => row.is_canonical).length,
    canonicalAssets: input.assets.filter((row) => row.is_canonical && row.status !== "retired").length,
    verifiedIdentifiers: input.identifiers.filter((row) => row.verified).length,
    sourceLinks: input.sourceLinks.length,
    verifiedSourceLinks: input.sourceLinks.filter((row) => row.verified).length,
    pendingMerges: input.candidates.filter((row) => row.status === "pending").length,
    approvedMerges: input.candidates.filter((row) => row.status === "approved").length,
    completeEditions: complete,
    completenessPercent: coverage.length ? Math.round((complete / coverage.length) * 100) : 0,
  };
}
