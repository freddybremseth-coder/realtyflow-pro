/**
 * Bounded lexical presence signals from already fetched public HTML.
 * A text match is NEVER source verification, truth, or a claim of an actual price.
 * No raw commercial values are retained in the report.
 */
export function inspectProjectClaimSignals(html: string) {
  const text = html
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<(script|style|template|svg)\b[^>]*>[^]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|euro);/gi, " ")
    .replace(/\s+/g, " ").slice(0, 100_000);
  return {
    priceMention: /(?:€|\beur\b|\beuro\b|\bpris\b|\bprice\b|\bprecio\b)/i.test(text),
    deliveryMention: /\b(?:leveringstid|ferdigstillelse|byggetid|delivery|completion|entrega|plazo)\b/i.test(text),
    energyMention: /\b(?:energiklasse|energieklasse|energy\s+(?:class|rating)|calificaci[oó]n\s+energ[eé]tica)\b/i.test(text),
    taxMention: /\b(?:IVA|AJD|ITP|mva|skatt|avgift|taxes|impuestos)\b/i.test(text),
    // All detected signals remain UNVERIFIED even when every category is present.
    verified: false as const,
  };
}
