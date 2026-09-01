import { askBookAuthor } from "@/services/ai/book-author-client";

type SuggestedItem = { label: string; confidence: number; rationale: string };
type SuggestedCategory = SuggestedItem & { scheme: "bisac" | "amazon_category"; channel: "" | "amazon"; code: string };
type TaxonomyResponse = {
  positioningSummary: string;
  categories: SuggestedCategory[];
  keywords: SuggestedItem[];
  audiences: SuggestedItem[];
  themes: SuggestedItem[];
};

export type TaxonomyProposal = {
  assignment_type: "category" | "keyword" | "audience" | "theme";
  scheme: "bisac" | "amazon_category" | "internal_keyword" | "internal_audience" | "internal_theme";
  channel: "" | "amazon";
  code: string;
  label: string;
  rank: number;
  confidence: number;
  rationale: string;
};

const ITEM = {
  type: "object", additionalProperties: false,
  properties: { label: { type: "string" }, confidence: { type: "number" }, rationale: { type: "string" } },
  required: ["label", "confidence", "rationale"],
};

const TAXONOMY_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    positioningSummary: { type: "string" },
    categories: {
      type: "array", minItems: 2, maxItems: 2,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          scheme: { type: "string", enum: ["bisac", "amazon_category"] }, channel: { type: "string", enum: ["", "amazon"] },
          code: { type: "string" }, label: { type: "string" }, confidence: { type: "number" }, rationale: { type: "string" },
        },
        required: ["scheme", "channel", "code", "label", "confidence", "rationale"],
      },
    },
    keywords: { type: "array", minItems: 7, maxItems: 7, items: ITEM },
    audiences: { type: "array", minItems: 1, maxItems: 3, items: ITEM },
    themes: { type: "array", minItems: 3, maxItems: 5, items: ITEM },
  },
  required: ["positioningSummary", "categories", "keywords", "audiences", "themes"],
};

function slug(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 100);
}

function bounded(value: unknown) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function buildTaxonomyPrompt(input: { title: string; subtitle?: string; language: string; description?: string; niche?: string; manuscriptExcerpt: string }) {
  return `BOOK TAXONOMY PROPOSAL\nTITLE: ${input.title}\nSUBTITLE: ${input.subtitle || "—"}\nLANGUAGE: ${input.language}\nNICHE/GENRE: ${input.niche || "—"}\nDESCRIPTION: ${input.description || "—"}\n\nMANUSCRIPT EXCERPT:\n${input.manuscriptExcerpt.slice(0, 20_000)}\n\nTASK:\nResearch and propose one current BISAC category, one Amazon browse-category path, exactly seven buyer-search phrases, one to three audiences, and three to five themes. Use current authoritative category information where available. BISAC code and label must form a real current pair; never invent a code. Amazon category code should be a stable full browse path when a numeric identifier is unavailable. Search phrases must reflect realistic buyer intent, not repeat the title or author, and must not make unsupported claims. Return proposals only. They remain unapproved until a human decision.`;
}

export async function suggestBookTaxonomy(input: { title: string; subtitle?: string; language: string; description?: string; niche?: string; chapters: Array<Record<string, any>> }) {
  const excerpt = input.chapters.map((chapter, index) => `## ${String(chapter.chapter_title || `Chapter ${index + 1}`)}\n${String(chapter.draft || "")}`).join("\n\n").slice(0, 20_000);
  const webSources: Array<{ title: string; url: string }> = [];
  const raw = await askBookAuthor(buildTaxonomyPrompt({ ...input, manuscriptExcerpt: excerpt }), {
    requireOpenAI: true, webSearch: true, responseMimeType: "application/json", responseSchema: TAXONOMY_SCHEMA, maxTokens: 4000,
    onWebSources: (sources) => webSources.push(...sources),
  });
  const parsed = JSON.parse(raw) as TaxonomyResponse;
  if (parsed.categories.length !== 2 || parsed.keywords.length !== 7 || parsed.audiences.length < 1 || parsed.themes.length < 3) throw new Error("OpenAI returnerte en ufullstendig taggepakke.");
  const proposals: TaxonomyProposal[] = [
    ...parsed.categories.map((item, index) => ({ assignment_type: "category" as const, scheme: item.scheme, channel: item.scheme === "amazon_category" ? "amazon" as const : "" as const, code: item.code.trim(), label: item.label.trim(), rank: index + 1, confidence: bounded(item.confidence), rationale: item.rationale.trim() })),
    ...parsed.keywords.map((item, index) => ({ assignment_type: "keyword" as const, scheme: "internal_keyword" as const, channel: "" as const, code: slug(item.label), label: item.label.trim(), rank: index + 1, confidence: bounded(item.confidence), rationale: item.rationale.trim() })),
    ...parsed.audiences.map((item, index) => ({ assignment_type: "audience" as const, scheme: "internal_audience" as const, channel: "" as const, code: slug(item.label), label: item.label.trim(), rank: index + 1, confidence: bounded(item.confidence), rationale: item.rationale.trim() })),
    ...parsed.themes.map((item, index) => ({ assignment_type: "theme" as const, scheme: "internal_theme" as const, channel: "" as const, code: slug(item.label), label: item.label.trim(), rank: index + 1, confidence: bounded(item.confidence), rationale: item.rationale.trim() })),
  ];
  if (proposals.some((item) => !item.code || !item.label)) throw new Error("Taggepakken inneholder tom kode eller etikett.");
  return { positioningSummary: parsed.positioningSummary, proposals, webSources };
}
