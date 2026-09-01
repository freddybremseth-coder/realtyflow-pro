export function launchFactoryHref(input: { editionId?: string | null; revisionId?: string | null }) {
  const params = new URLSearchParams();
  const editionId = String(input.editionId || "").trim();
  const revisionId = String(input.revisionId || "").trim();
  if (editionId) params.set("editionId", editionId);
  if (revisionId) params.set("revisionId", revisionId);
  const query = params.toString();
  return query ? `/book-growth/launch-factory?${query}` : "/book-growth/launch-factory";
}
