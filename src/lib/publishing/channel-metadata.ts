import { createHash } from "node:crypto";

export const BOOK_METADATA_CHANNELS = ["amazon_kdp", "apple_books", "google_play_books", "kobo_writing_life"] as const;
export type BookMetadataChannel = (typeof BOOK_METADATA_CHANNELS)[number];

type TaxonomyAssignment = {
  id: string; assignment_type: "category" | "keyword" | "audience" | "theme";
  scheme: string; channel?: string | null; code: string; label: string; rank: number; status: string;
};

export type ChannelMetadataSource = {
  editionId: string; revisionId: string; title: string; subtitle?: string | null; language: string;
  author: string; description: string; taxonomy: TaxonomyAssignment[];
};

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildChannelMetadataPackages(source: ChannelMetadataSource) {
  const approved = source.taxonomy.filter((row) => row.status === "approved");
  const keywords = approved.filter((row) => row.assignment_type === "keyword").sort((a, b) => a.rank - b.rank).slice(0, 7);
  const bisac = approved.filter((row) => row.assignment_type === "category" && row.scheme === "bisac").sort((a, b) => a.rank - b.rank);
  const amazon = approved.filter((row) => row.assignment_type === "category" && row.scheme === "amazon_category").sort((a, b) => a.rank - b.rank);
  const audiences = approved.filter((row) => row.assignment_type === "audience").sort((a, b) => a.rank - b.rank);
  const themes = approved.filter((row) => row.assignment_type === "theme").sort((a, b) => a.rank - b.rank);
  if (!source.title.trim() || !source.author.trim() || !source.language.trim() || !source.description.trim()) throw new Error("Tittel, forfatter, språk og beskrivelse må være klare");
  if (keywords.length < 5 || (!bisac.length && !amazon.length)) throw new Error("Godkjent metadata må ha minst én kategori og 5–7 søkeord");

  return BOOK_METADATA_CHANNELS.map((channel) => {
    const categories = channel === "amazon_kdp" && amazon.length ? amazon : bisac;
    if (!categories.length) throw new Error(`${channel} mangler godkjent kategori`);
    const sourceAssignmentIds = [...categories, ...keywords, ...audiences, ...themes].map((row) => row.id);
    const payload = {
      schemaVersion: 1, channel, title: source.title.trim(), subtitle: source.subtitle?.trim() || null,
      author: source.author.trim(), language: source.language.trim().toLowerCase(), description: source.description.trim(),
      categories: categories.map(({ scheme, code, label }) => ({ scheme, code, label })),
      keywords: keywords.map((row) => row.label), audiences: audiences.map((row) => row.label), themes: themes.map((row) => row.label),
      source: { editionId: source.editionId, revisionId: source.revisionId, taxonomyAssignmentIds: sourceAssignmentIds },
      delivery: { submitted: false, note: "Godkjent metadata er ikke det samme som innsending til forhandler." },
    };
    return { channel, payload, sourceAssignmentIds, payloadFingerprint: hash(payload) };
  });
}
