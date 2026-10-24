import type { PropertyEditorialNo } from "./property-editorial-no";

// Similarity is a warning, not evidence that two units are identical.
function tokens(value: string): string[] {
  return (value.toLocaleLowerCase("nb").match(/[\p{L}\p{N}]+/gu) || []).filter(x => x.length > 2);
}
function shingles(value: string): Set<string> {
  const words = tokens(value);
  const result = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) result.add(words.slice(i, i + 3).join(" "));
  return result;
}
export function editorialTextSimilarity(a: string, b: string): number {
  const left = shingles(a), right = shingles(b);
  if (left.size < 5 || right.size < 5) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / Math.max(left.size, right.size);
}
export function editorialReviewSimilarity(
  propertyId: string,
  editorial: Pick<PropertyEditorialNo, "intro_no" | "bullets_no">,
  others: Array<{ id: string; editorial_no: unknown }>,
  threshold = 0.83,
): { similarTo: string; score: number } | null {
  const value = [editorial.intro_no, ...editorial.bullets_no].join(" ");
  for (const item of others) {
    if (item.id === propertyId || !item.editorial_no || typeof item.editorial_no !== "object") continue;
    const other = item.editorial_no as { intro_no?: unknown; bullets_no?: unknown };
    const text = [typeof other.intro_no === "string" ? other.intro_no : "", ...(Array.isArray(other.bullets_no) ? other.bullets_no.filter(x => typeof x === "string") : [])].join(" ");
    const score = editorialTextSimilarity(value, text);
    if (score >= threshold) return { similarTo: item.id, score };
  }
  return null;
}
