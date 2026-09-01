import { bookProjectCoverUrl } from "./book-project-docx-export";

function clean(value: unknown) {
  return String(value || "").trim();
}

export function productionHandoffMetadataReadiness(project: Record<string, any>) {
  const metadata = project.metadata_plan && typeof project.metadata_plan === "object" ? project.metadata_plan : {};
  const kdp = metadata.kdp && typeof metadata.kdp === "object" ? metadata.kdp : metadata;
  const keywords = Array.isArray(kdp.keywords) ? kdp.keywords.map(String).map((v) => v.trim()).filter(Boolean) : [];
  const categories = Array.isArray(kdp.categories) ? kdp.categories.map(String).map((v) => v.trim()).filter(Boolean) : [];
  const description = clean(kdp.description_html) || clean(kdp.description);
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (!clean(project.title)) blocking.push("Title is required.");
  if (!description) blocking.push("Retailer description is required before publication-ready handoff.");
  if (!keywords.length) blocking.push("At least one retailer keyword is required before publication-ready handoff.");
  if (!categories.length) blocking.push("At least one retailer category is required before publication-ready handoff.");
  if (keywords.length > 7) warnings.push("More than seven keyword phrases are present; KDP uses up to seven keyword fields.");
  if (!clean(project.subtitle)) warnings.push("Subtitle is empty.");
  if (!clean(project.series_name)) warnings.push("Series name is empty.");

  return {
    ok: blocking.length === 0,
    blocking,
    warnings,
    descriptionPresent: Boolean(description),
    keywordCount: keywords.length,
    categoryCount: categories.length,
  };
}

export function productionHandoffPreflight(project: Record<string, any>, hasCover: boolean) {
  const chapters = Array.isArray(project.chapter_drafts) ? project.chapter_drafts : [];
  const metadata = productionHandoffMetadataReadiness(project);
  const blocking = [...metadata.blocking];
  const warnings = [...metadata.warnings];

  if (project.status !== "ready_for_export") blocking.unshift("Project must be ready_for_export before production handoff.");
  if (!chapters.length) blocking.push("Project has no manuscript chapters.");
  if (!hasCover) blocking.push("Project has no retrievable canonical cover.");

  return {
    ok: blocking.length === 0,
    blocking,
    warnings,
    productionStatus: blocking.length ? "incomplete" : "publication_ready_candidate",
    chapterCount: chapters.length,
    coverUrl: bookProjectCoverUrl(project),
    metadata,
    plannedArtifacts: [
      "english_master_docx",
      "retailer_epub",
      "ebook_cover",
      "retailer_metadata",
      "print_interior_6x9_pdf",
      "kdp_full_wrap_pdf",
      "complete_publication_package_zip",
    ],
    next: blocking.length
      ? "Resolve blocking readiness issues before generating immutable assets."
      : "Owner may generate immutable publication-ready assets. Quality Center remains mandatory after ingest.",
  };
}
