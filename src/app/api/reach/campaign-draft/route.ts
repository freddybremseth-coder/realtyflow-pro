import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";
import { askClaude } from "@/services/ai/claude-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

/**
 * POST /api/reach/campaign-draft
 * Body: { brand_id, campaign_type, topic?, include_properties? }
 *   campaign_type: "kampanje" | "nyhetsbrev" | "prisoppdatering" | "info"
 *
 * Drafts a ready-to-paste Reach campaign (subject + preheader + inline-CSS
 * HTML) in the brand's voice. With include_properties the latest visible
 * properties (incl. price changes) are woven in — the "prisoppdateringer
 * av boliger" use case.
 */

const TYPE_INSTRUCTIONS: Record<string, string> = {
  kampanje: "Salgskampanje: ett tydelig tilbud/budskap, sterk CTA, kort og punchy.",
  nyhetsbrev: "Nyhetsbrev: 2-4 korte saker med mellomtitler, vennlig og informativ tone, én hoved-CTA.",
  prisoppdatering: "Prisoppdatering på boliger: presenter boligene med pris og hva som er nytt/endret, skap 'act now'-følelse uten å presse.",
  info: "Verdifullt innhold: konkrete tips/innsikt kunden faktisk har nytte av (marked, kjøpsprosess, sesong), myk CTA til slutt.",
};

function cleanJson(text: string) {
  const stripped = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  return start >= 0 ? stripped.slice(start, stripped.lastIndexOf("}") + 1) : stripped;
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const brandId = String(body.brand_id || "").trim();
  const campaignType = String(body.campaign_type || "nyhetsbrev");
  const topic = String(body.topic || "").trim();
  const includeProperties = body.include_properties === true;

  const supabase = createServerClient();

  // Brand voice from brand_settings when available.
  let brandContext = brandId;
  try {
    const { data: brandRow } = await supabase
      .from("brand_settings")
      .select("settings")
      .eq("brand_id", brandId)
      .maybeSingle();
    const s = (brandRow?.settings || {}) as Record<string, unknown>;
    brandContext = [brandId, s.name, s.tone, s.description].filter(Boolean).join(" · ");
  } catch {
    // Brand context is a nice-to-have.
  }

  // Latest properties for prisoppdatering/nyhetsbrev content.
  let propertiesContext = "";
  if (includeProperties) {
    try {
      const { data: properties } = await supabase
        .from("properties")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(5);
      if (properties?.length) {
        propertiesContext = `\nAKTUELLE BOLIGER (bruk disse i innholdet):\n${properties
          .map((p: Record<string, unknown>) => {
            const parts = [p.title, p.location, p.price ? `${p.price} EUR` : null, p.external_id ? `ref ${p.external_id}` : null]
              .filter(Boolean)
              .join(" — ");
            return `- ${parts}`;
          })
          .join("\n")}`;
      }
    } catch {
      // Without properties the draft is still useful.
    }
  }

  const prompt = `Du skriver en e-postkampanje for Hostinger Reach på vegne av et norsk eiendoms-/tjenesteselskap.

BRAND: ${brandContext}
TYPE: ${TYPE_INSTRUCTIONS[campaignType] || TYPE_INSTRUCTIONS.nyhetsbrev}
${topic ? `TEMA/BRIEF: ${topic}` : ""}${propertiesContext}

Krav:
- Norsk, direkte og verdifull for leseren — aldri fyllstoff eller meta-tekst
- HTML-en skal være en komplett e-postkropp med INLINE CSS (maks 600px bred tabell-layout, mobilvennlig, lesbar i Gmail/Outlook)
- Bruk brandets navn naturlig; én tydelig CTA-knapp (lenke kan være #)
- Ikke inkluder <html>/<head>/<body>-tagger — kun innholdet

Returner KUN gyldig JSON:
{
  "subject": "emnefelt, maks 60 tegn, vekker interesse uten clickbait",
  "preheader": "forhåndsvisningstekst, maks 90 tegn",
  "html": "komplett e-post-HTML med inline CSS"
}`;

  try {
    const text = await askClaude(prompt, { maxTokens: 3200, temperature: 0.7, responseMimeType: "application/json" });
    const draft = JSON.parse(cleanJson(text)) as { subject?: string; preheader?: string; html?: string };
    if (!draft.subject || !draft.html) throw new Error("AI-utkastet manglet felt.");
    return NextResponse.json({ ok: true, draft });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke generere utkast." },
      { status: 500 },
    );
  }
}
