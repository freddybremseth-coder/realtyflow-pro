export type AutopilotHeartbeatResult = Record<string, unknown>;

export function summarizeMarketingAutopilotHeartbeat(results: AutopilotHeartbeatResult[]) {
  const brands = Array.from(new Set(results.map((row) => String(row.brandId || "").trim()).filter(Boolean))).sort();
  const channels = Array.from(new Set(results.map((row) => String(row.channel || "").trim()).filter(Boolean))).sort();
  let skipped = 0;
  let errored = 0;
  let publicationResults = 0;
  let publicationErrors = 0;
  let sourceMarked = 0;

  for (const row of results) {
    if (row.skipped === true) skipped += 1;
    if (typeof row.error === "string" && row.error.trim()) errored += 1;
    const publications = Array.isArray(row.publications) ? row.publications as Array<Record<string, unknown>> : [];
    publicationResults += publications.length;
    publicationErrors += publications.filter((item) => typeof item.error === "string" && item.error.trim()).length;
    const source = row.source && typeof row.source === "object" ? row.source as Record<string, unknown> : null;
    if (source?.sourceMarked === true) sourceMarked += 1;
  }

  const status = errored > 0 || publicationErrors > 0 ? "partial" : "success";
  return {
    status,
    brands,
    channels,
    resultCount: results.length,
    skipped,
    errored,
    publicationResults,
    publicationErrors,
    sourceMarked,
  };
}
