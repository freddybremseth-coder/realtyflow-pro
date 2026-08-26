import { buildNexusBusinessOpportunity, type NexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";

export interface BookGrowthPriorityInput {
  bookId: string;
  slug: string;
  title: string;
  language?: string | null;
  seriesTitle?: string | null;
  seriesNumber?: number | null;
  hasAsin?: boolean;
  pendingRecommendations?: number;
  score: number;
  events30d: {
    bookViews: number;
    sampleClicks: number;
    amazonClicks: number;
    directBuyClicks: number;
  };
  economics90d?: {
    royalties?: number;
    units?: number;
    pagesRead?: number;
    adSpend?: number;
    adSales?: number;
    orders?: number;
    currencies?: string[];
    monetarySafe?: boolean;
  } | null;
}

function stageFor(book: BookGrowthPriorityInput) {
  const economics = book.economics90d ?? {};
  const units = Number(economics.units || 0);
  const orders = Number(economics.orders || 0);
  if (units > 0 || orders > 0) return "purchased";
  if (book.events30d.directBuyClicks > 0 || book.events30d.amazonClicks > 0) return "purchase_intent";
  if (book.events30d.sampleClicks > 0) return "sample_engaged";
  return "discovered";
}

function reasonFor(book: BookGrowthPriorityInput, stageId: string) {
  const e = book.economics90d ?? {};
  if (stageId === "purchased") {
    return `${Number(e.units || 0)} units / ${Number(e.orders || 0)} orders siste 90 dager. Optimaliser videre salg, serieoppdagelse og retention.`;
  }
  if (stageId === "purchase_intent") {
    return `${book.events30d.amazonClicks} Amazon-klikk og ${book.events30d.directBuyClicks} direkte kjøpsklikk siste 30 dager viser konkret kjøpsintensjon.`;
  }
  if (stageId === "sample_engaged") {
    return `${book.events30d.sampleClicks} sample-klikk siste 30 dager viser aktiv leserinteresse som bør flyttes mot retailer conversion.`;
  }
  return `${book.events30d.bookViews} bokvisninger siste 30 dager kombinert med readiness-/growth-score ${Math.round(book.score)}.`;
}

function nextActionFor(book: BookGrowthPriorityInput, stageId: string) {
  if (stageId === "purchased") {
    return book.seriesTitle
      ? "Styrk serie-overgangen: gjør neste bok tydelig på produktside, sample og relevant post-purchase innhold."
      : "Bruk dokumentert salg til å forbedre discoverability, metadata og relevant katalog-cross-sell.";
  }
  if (stageId === "purchase_intent") {
    return "Reduser friksjon mellom interesse og kjøp: verifiser retailer-link/ASIN, metadata, cover, description og tydelig buy-path.";
  }
  if (stageId === "sample_engaged") {
    return "Forsterk overgangen fra sample til kjøp med sterkere bokløfte, CTA, retailer-link og relevant sosial proof/evidence.";
  }
  return "Øk kvalifisert discoverability med riktig metadata, sample, serieplassering og innhold mot målgruppen.";
}

export function bookGrowthPriorityToPublishingOpportunity(book: BookGrowthPriorityInput): NexusBusinessOpportunity | null {
  const stageId = stageFor(book);
  const economics = book.economics90d ?? {};
  const safeCurrency = economics.monetarySafe !== false && Array.isArray(economics.currencies) && economics.currencies.length === 1
    ? economics.currencies[0]
    : null;
  const royalties = safeCurrency ? Number(economics.royalties || 0) : null;

  return buildNexusBusinessOpportunity({
    id: `book-growth:${book.bookId}`,
    brandId: "freddypublishing",
    offerId: book.bookId,
    pipelineId: "publishing",
    stageId,
    title: book.seriesTitle ? `${book.title} · ${book.seriesTitle}${book.seriesNumber ? ` #${book.seriesNumber}` : ""}` : book.title,
    reason: reasonFor(book, stageId),
    nextAction: nextActionFor(book, stageId),
    priorityScore: book.score,
    value: royalties,
    currency: safeCurrency,
    sourceSystem: "book_growth",
    sourceId: book.bookId,
    href: "/book-growth",
    routeConfidence: "high",
    routeReason: "Book Growth OS er eksplisitt Freddy Publishing-data og routes derfor direkte til publishing-pipelinen.",
  });
}

export function bookGrowthPrioritiesToPublishingOpportunities(books: BookGrowthPriorityInput[]) {
  return books.map(bookGrowthPriorityToPublishingOpportunity).filter((item): item is NexusBusinessOpportunity => Boolean(item));
}
