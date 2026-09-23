import { loadPublishedMixArt, loadPublishedMixBooks, type PromotionItem } from "./remaster-mix-promotions";
import { loadZenEcoHomesVisualUrls } from "./remaster-mix-visual-source";
import type { RemasterMixRegion, RemasterMixVisualType } from "./remaster-mix-planner";

/** Curated public brand media from the Doña Anna website's public asset repository.
 * Pin the revision so a video never silently switches to an unreviewed image. */
const DONA_ANNA_ASSET_ROOT =
  "https://raw.githubusercontent.com/freddybremseth-coder/donaanna/6f82e16f661e0d3c62b49ce8c1312c758e6e736e/public/donaanna/";
export const DONA_ANNA_REEL_IMAGES = [
  "hero-image.jpg",
  "olive-trees.jpg",
  "farming-1.jpg",
  "farming-2.jpg",
  "early-harvest.jpg",
  "uploads/dona-anna-pouring-bread.jpg",
  "product-design/full-product-lineup.jpg",
  "uploads/cocina-viva-bottle-studio.jpg",
].map(file => DONA_ANNA_ASSET_ROOT + file);

export function selectedReelImages(urls: string[], seed: string, count: number): string[] {
  const ordered = [...new Set(urls.filter(Boolean))];
  let state = 2166136261;
  for (const char of seed) { state ^= char.charCodeAt(0); state = Math.imul(state, 16777619); }
  for (let index = ordered.length - 1; index > 0; index--) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const pick = Math.floor(((state >>> 0) / 4294967296) * (index + 1));
    [ordered[index], ordered[pick]] = [ordered[pick], ordered[index]];
  }
  return ordered.slice(0, count);
}

export async function loadFreddyReelVisuals(seed: string, count: number): Promise<{
  urls: string[]; items: PromotionItem[];
}> {
  const [art, books] = await Promise.all([loadPublishedMixArt(), loadPublishedMixBooks()]);
  const picked = selectedReelImages([...art, ...books].map(item => item.imageUrl), seed, count);
  const lookup = new Map([...art, ...books].map(item => [item.imageUrl, item]));
  return { urls: picked, items: picked.map(url => lookup.get(url)!).filter(Boolean) };
}

export async function loadPinosoReelVisuals(input: {
  seed: string; count: number; region: RemasterMixRegion;
  areaQuery: string; visualTypes: RemasterMixVisualType[];
}): Promise<string[]> {
  const result = await loadZenEcoHomesVisualUrls({
    targetMinutes: 1, region: input.region, visualType: input.visualTypes[0] || "mixed",
    visualTypes: input.visualTypes, randomSeed: input.seed, strictSelection: true,
    areaQuery: input.areaQuery || undefined, brandId: "pinosoecolife",
  });
  return [...new Set(result.urls)].slice(0, input.count);
}
