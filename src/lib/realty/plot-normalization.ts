function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function finiteNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const direct = Number(raw);
  if (Number.isFinite(direct)) return direct;

  const compact = raw.replace(/\s+/g, "");
  if (/^\d{1,3}(?:[.]\d{3})+$/.test(compact)) {
    const parsed = Number(compact.replace(/\./g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (/^\d{1,3}(?:[,]\d{3})+$/.test(compact)) {
    const parsed = Number(compact.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function extractPlotAreaFromSource(notes: unknown): number {
  const text = String(notes ?? "");
  if (!text) return 0;

  const matches = Array.from(text.matchAll(/(\d{1,3}(?:[.\s-]\d{3})+|\d{4,6})\s*m(?:²|2)/gi));
  const values = matches
    .map((match) => Number(String(match[1] || "").replace(/[.\s-]/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0);

  return values.length ? Math.max(...values) : 0;
}

export function normalizePlotArea(area: unknown, notes: unknown): number {
  const importedArea = finiteNumber(area);
  const sourceArea = extractPlotAreaFromSource(notes);

  if (!sourceArea) return importedArea;
  if (!importedArea) return sourceArea;

  // Known KML failure mode: a thousands group is dropped, e.g. 12 554 -> 554.
  if (importedArea < 1000 && sourceArea >= 1000) return sourceArea;
  if (sourceArea >= importedArea * 5) return sourceArea;

  return importedArea;
}

export function normalizePlotZoning(zoning: unknown, ...sourceParts: unknown[]): string {
  const imported = fold(zoning);
  const sourceText = fold(sourceParts.filter(Boolean).join(" "));

  const saysUrbanizable = /\burbanizable\b/.test(sourceText);
  const saysUrban = /\burbano\b|\burbana\b/.test(sourceText);
  const saysRustic = /\brustico\b|\brustica\b/.test(sourceText);

  if (saysUrbanizable && (!imported || imported === "rustico")) return "urbanizable";
  if (saysUrban && (!imported || imported === "rustico")) return "urbano";
  if (saysRustic && !imported) return "rustico";

  return imported || "rustico";
}
