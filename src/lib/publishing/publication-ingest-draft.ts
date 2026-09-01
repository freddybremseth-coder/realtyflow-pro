export type PublicationIngestDraftInput = {
  seriesKey: string;
  bookKey: string;
  title: string;
  subtitle?: string;
  seriesName?: string;
  seriesNumber?: number;
  language?: string;
  format?: "ebook" | "paperback" | "hardcover" | "audio" | "other";
  revisionNumber?: number;
};

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function buildPublicationIngestDraft(input: PublicationIngestDraftInput) {
  const seriesKey = slug(input.seriesKey);
  const bookKey = slug(input.bookKey);
  const language = slug(input.language || "en") || "en";
  const format = input.format || "ebook";
  const revisionNumber = Math.max(1, Math.trunc(Number(input.revisionNumber || 1)));
  if (!seriesKey || !bookKey) throw new Error("seriesKey and bookKey are required");
  if (!input.title.trim()) throw new Error("title is required");

  const workKey = `${seriesKey}:${bookKey}`;
  const editionKey = `${workKey}:${language}:${format}`;
  return {
    action: "preview",
    actor: "admin_ui",
    manifest: {
      ingestKey: `${workKey}:${language}:r${revisionNumber}`,
      workKey,
      editionKey,
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || "",
      seriesName: input.seriesName?.trim() || "",
      seriesNumber: Number.isFinite(Number(input.seriesNumber)) ? Math.trunc(Number(input.seriesNumber)) : undefined,
      language,
      format,
      revisionNumber,
      packageFingerprint: "",
      contentFingerprint: "",
      productionStatus: "production_ready",
      assets: [],
    },
  };
}
