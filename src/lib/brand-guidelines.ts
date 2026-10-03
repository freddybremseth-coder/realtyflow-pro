import fs from "node:fs";
import path from "node:path";

/**
 * Bindende merkevareinstrukser per brand. Kilden er markdown-filer i docs/brands/
 * (tas med i Vercel-builden via experimental.outputFileTracingIncludes i next.config.mjs).
 */
const FILES: Record<string, string> = {
  donaanna: "docs/brands/dona-anna.md",
};

/** Navn/aliaser som skal peke til en brand-id med instruks. */
const BRAND_ALIASES: Array<{ id: string; pattern: RegExp }> = [
  { id: "donaanna", pattern: /\b(do(?:ñ|n)a[\s_-]?anna)\b/i },
];

/** Bilde-prompt-tillegg fra instruksens §5 (bildegenerering). */
const IMAGE_PROMPT_SUFFIX: Record<string, { base: string; noText: string }> = {
  donaanna: {
    base:
      "Warm Mediterranean golden-hour light, olive groves in Biar Alicante, dark matte bottle glass, cotton-white narrow label, brushed gold accents, large negative space, luxury perfume/wine aesthetic, natural photography, no people's faces unless supplied.",
    noText: "No text.",
  },
};

const cache = new Map<string, string>();

/** Normaliserer brand-id eller visningsnavn («Doña Anna», «Dona Anna», «dona-anna») til en id med instruks. */
export function resolveBrandId(brand?: string | null): string | null {
  if (!brand) return null;
  const raw = String(brand).trim();
  if (FILES[raw]) return raw;
  const compact = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  if (FILES[compact]) return compact;
  return detectBrandId(raw);
}

/** Finner brand med instruks nevnt i fritekst (f.eks. en brukerprompt). */
export function detectBrandId(text?: string | null): string | null {
  if (!text) return null;
  for (const { id, pattern } of BRAND_ALIASES) {
    if (pattern.test(text)) return id;
  }
  return null;
}

export function getBrandGuidelines(brandId?: string | null): string {
  const id = resolveBrandId(brandId);
  if (!id || !FILES[id]) return "";
  if (!cache.has(id)) {
    try {
      cache.set(id, fs.readFileSync(path.join(process.cwd(), FILES[id]), "utf8"));
    } catch (err) {
      console.error(`[brand-guidelines] Kunne ikke lese ${FILES[id]}:`, err);
      cache.set(id, "");
    }
  }
  const g = cache.get(id)!;
  return g ? `\n\n## MERKEVAREINSTRUKS (bindende)\n${g}` : "";
}

/** Legger instruksen til en systemprompt uten å duplisere den. */
export function withBrandGuidelines(systemPrompt: string | undefined, brandId?: string | null): string | undefined {
  const g = getBrandGuidelines(brandId);
  if (!g) return systemPrompt;
  if (systemPrompt?.includes("## MERKEVAREINSTRUKS (bindende)")) return systemPrompt;
  return `${systemPrompt ?? ""}${g}`;
}

/** Tillegg til bilde-prompter. allowText=true når prompten skal bevare ekte etikett-tekst. */
export function getBrandImagePromptSuffix(brand?: string | null, opts?: { allowText?: boolean }): string {
  const id = resolveBrandId(brand);
  const s = id ? IMAGE_PROMPT_SUFFIX[id] : undefined;
  if (!s) return "";
  return opts?.allowText ? s.base : `${s.base} ${s.noText}`;
}
