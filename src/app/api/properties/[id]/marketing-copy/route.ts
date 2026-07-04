/**
 * POST /api/properties/:id/marketing-copy
 *
 * Generate AI selling copy for a single property and (by default) save it
 * to `properties.marketing_description`. The PDF generator prefers this
 * field over `description` when present.
 *
 * Body:
 *   tone?     : "warm" | "luxury" | "family" | "lifestyle" | "investment"
 *   notes?    : string                              extra angle from agent
 *   brandId?  : string                              if present, the area
 *                                                   profile for the property's
 *                                                   location is fed into the
 *                                                   prompt for richer copy
 *   save?     : boolean (default true)              persist to DB
 *
 * Returns:
 *   { copy: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { askClaude } from "@/services/ai/claude-client";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const TONE_HINTS: Record<string, string> = {
  warm: "varm, personlig og inviterende — som en venn som forteller om hjemmet sitt",
  luxury: "elegant, eksklusiv, sofistikert — for en kresen kjøper",
  family: "familievennlig, trygg, praktisk — fokus på hverdagsliv med barn",
  lifestyle: "livsstilsorientert — sol, sjø, hverdagsglede, slow living",
  investment: "rasjonell og verdifokusert — leieinntekt, beliggenhet, vekstpotensial",
};

const SYSTEM_PROMPT = `Du er en erfaren spansk eiendomsmegler som skriver salgstekster for skandinaviske kjøpere.

Skriv på norsk (bokmål), unntatt egennavn. Stilen er konkret og ærlig — du selger ved å beskrive opplevelsen av å bo der, ikke ved å overdrive.

Krav til output:
- 3–5 avsnitt, til sammen 200–350 ord
- Start med en sterk åpningssetning som vekker følelse — ikke et generisk "Velkommen til ..."
- Beskriv først boligen (rom, lys, materialer, utsikt, uteliv), deretter hvordan den fungerer i hverdagen, og avslutt med stedet rundt
- Bruk konkrete detaljer fra fakta-listen — ikke finn på rom eller funksjoner
- Ingen overskrifter, ingen punktlister, ingen markdown — bare flytende avsnitt
- Avslutt med en kort, lavmælt invitasjon til visning eller samtale

Returner KUN selve teksten, uten anførselstegn eller forklaring.`;

interface RouteCtx { params: { id: string } }

export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    const unauthorized = await requireAdminApi(req);
    if (unauthorized) return unauthorized;

    const id = params.id;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as {
      tone?: keyof typeof TONE_HINTS | string;
      notes?: string;
      brandId?: string;
      save?: boolean;
    };

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const { data: property, error: pErr } = await supabase
      .from("properties")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    // Optional area context for richer copy
    let areaContext = "";
    if (body.brandId && property.location) {
      const slug = slugify(property.location);
      const { data: area } = await supabase
        .from("area_profiles")
        .select("name, hero_blurb, description, highlights, climate, lifestyle")
        .eq("brand_id", body.brandId)
        .eq("slug", slug)
        .maybeSingle();
      if (area) {
        const lines = [`Områdeprofil for ${area.name}:`];
        if (area.hero_blurb) lines.push(`Tagline: ${area.hero_blurb}`);
        if (area.description) lines.push(`Beskrivelse: ${area.description}`);
        if (Array.isArray(area.highlights) && area.highlights.length) {
          lines.push(`Høydepunkter: ${area.highlights.join("; ")}`);
        }
        if (area.lifestyle) lines.push(`Hverdagsliv: ${area.lifestyle}`);
        areaContext = lines.join("\n");
      }
    }

    const facts: string[] = [];
    const push = (label: string, value: unknown) => {
      if (value !== null && value !== undefined && value !== "") {
        facts.push(`- ${label}: ${value}`);
      }
    };
    push("Tittel", property.title);
    push("Type", property.property_type || property.type);
    push("Lokasjon", property.location);
    push("Pris (EUR)", property.price);
    push("Soverom", property.bedrooms);
    push("Bad", property.bathrooms);
    push("Boligareal (m²)", property.built_area || property.area);
    push("Tomt (m²)", property.plot_size);
    push("Byggeår", property.year_built);
    push("Energimerking", property.energy_rating);
    push("Basseng", property.pool ? "ja" : null);
    push("Garasje", property.garage ? "ja" : null);
    if (property.description) push("Meglerens råtekst / fakta", property.description);
    if (property.title_no || property.description_no) {
      push("Norsk variant (eksisterende)", property.description_no || property.title_no);
    }

    const tone = (body.tone && TONE_HINTS[body.tone as string]) || TONE_HINTS.warm;

    const prompt = [
      `Skriv en salgstekst i denne tonen: ${tone}.`,
      "",
      "Fakta om boligen:",
      facts.join("\n"),
      "",
      body.notes?.trim() ? `Ekstra vinkling fra megleren:\n${body.notes.trim()}\n` : "",
      areaContext
        ? `\nBruk følgende områdekunnskap for det avsluttende avsnittet om stedet (ikke kopier ordrett, vev det inn naturlig):\n${areaContext}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const copy = await askClaude(prompt, {
      systemPrompt: SYSTEM_PROMPT,
      model: "sonnet",
      maxTokens: 900,
      temperature: 0.75,
    });

    const cleaned = copy
      .replace(/^```[a-z]*\s*/i, "")
      .replace(/```\s*$/i, "")
      .replace(/^["']|["']$/g, "")
      .trim();

    const save = body.save !== false;
    if (save) {
      await supabase
        .from("properties")
        .update({ marketing_description: cleaned })
        .eq("id", id);
    }

    return NextResponse.json({ copy: cleaned, saved: save });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generate failed";
    console.error("[properties/marketing-copy]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
