/**
 * Derive a public, narrow pricing fact from the ORIGINAL RedSP description.
 * "Example plot in the advertised price basis" is NOT an assigned plot, deed,
 * reservation or permission to build. Never infer from plot_size or builder.
 * The full source description stays server-side.
 */
export function getIllustrativePlotPriceEur(
  source: unknown,
  originalDescription: unknown,
): number | null {
  if (String(source || "").trim().toLowerCase() !== "redsp") return null;
  if (typeof originalDescription !== "string" || !originalDescription.trim()) return null;
  const text = originalDescription.replace(/\\n|&#13;|&#10;|\s+/gi, " ").replace(/\s+/g, " ");

  const expressions = [
    /i denne annonsen er en tomt til\s*(?:en pris av\s*)?([\d .]{4,14})\s*(?:euro|eur|€)\s*brukt som eksempel/i,
    /den oppgitte prisen er basert på en tomt verdsatt til\s*([\d .]{4,14})\s*(?:euro|eur|€)/i,
    /(?:advertised|listing) price is based on (?:an? )?(?:example )?plot (?:valued|priced) at\s*(?:€\s*)?([\d ,.]{4,14})\s*(?:euro|eur|€)?/i,
  ];
  for (const expression of expressions) {
    const match = text.match(expression);
    if (!match) continue;
    const value = Number(match[1].replace(/[^\d]/g, ""));
    if (Number.isFinite(value) && value >= 1000 && value <= 5_000_000) return value;
  }
  return null;
}
