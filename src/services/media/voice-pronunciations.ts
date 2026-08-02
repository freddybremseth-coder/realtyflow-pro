import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const voicePronunciationInputSchema = z.object({
  brandId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(80).nullable().optional(),
  language: z.string().min(2).max(80).default("Norwegian"),
  term: z.string().trim().min(1).max(120),
  pronunciation: z.string().trim().min(1).max(240),
  notes: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().default(true),
});

export type VoicePronunciationInput = z.infer<typeof voicePronunciationInputSchema>;

export interface VoicePronunciationRule {
  id: string;
  organization_id: string;
  brand_id?: string | null;
  language: string;
  term: string;
  pronunciation: string;
  notes?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function normalized(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export function pronunciationInstructionsForText(
  rules: VoicePronunciationRule[],
  text: string,
) {
  const normalizedText = normalized(text.trim());
  if (!normalizedText) return "";

  const matching = rules.filter((rule) => rule.active && normalizedText.includes(normalized(rule.term)));
  if (!matching.length) return "";

  return [
    "Pronunciation dictionary:",
    ...matching.map((rule) => `Pronounce “${rule.term}” as “${rule.pronunciation}”.`),
    "Apply these pronunciations exactly, but do not read this dictionary aloud.",
  ].join(" ");
}

export async function listVoicePronunciations(
  supabase: SupabaseClient,
  params: { organizationId: string; brandId?: string | null; language?: string; includeInactive?: boolean },
) {
  let query = supabase
    .from("media_voice_pronunciations")
    .select("*")
    .eq("organization_id", params.organizationId)
    .order("brand_id", { ascending: true, nullsFirst: true })
    .order("term", { ascending: true });

  if (!params.includeInactive) query = query.eq("active", true);
  if (params.language) query = query.eq("language", params.language);
  if (params.brandId) {
    const safeBrandId = z.string().regex(/^[A-Za-z0-9_-]+$/).max(80).parse(params.brandId);
    query = query.or(`brand_id.is.null,brand_id.eq.${safeBrandId}`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as VoicePronunciationRule[];
}

export async function upsertVoicePronunciation(
  supabase: SupabaseClient,
  params: { organizationId: string; input: VoicePronunciationInput },
) {
  const input = voicePronunciationInputSchema.parse(params.input);
  const { data, error } = await supabase
    .from("media_voice_pronunciations")
    .upsert({
      organization_id: params.organizationId,
      brand_id: input.brandId || null,
      language: input.language,
      term: input.term,
      pronunciation: input.pronunciation,
      notes: input.notes || null,
      active: input.active,
    }, { onConflict: "organization_id,brand_id,language,term" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as VoicePronunciationRule;
}

export async function deleteVoicePronunciation(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
) {
  const { data, error } = await supabase
    .from("media_voice_pronunciations")
    .delete()
    .eq("organization_id", params.organizationId)
    .eq("id", params.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Fant ikke uttaleregelen.");
  return true;
}

export async function buildPronunciationInstructions(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    brandId?: string | null;
    language?: string | null;
    text: string;
  },
) {
  if (!params.text.trim()) return "";

  const rules = await listVoicePronunciations(supabase, {
    organizationId: params.organizationId,
    brandId: params.brandId || null,
    language: params.language || "Norwegian",
  });
  return pronunciationInstructionsForText(rules, params.text);
}
