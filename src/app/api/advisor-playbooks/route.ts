import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const seedPlaybooks = [
  {
    id: "seed-valencia-rental-10-day",
    brand_id: "zeneco",
    title: "Costa Blanca: utleie, VUT og 10-dagersregelen",
    topic: "buyer_advice",
    region: "Comunitat Valenciana / Costa Blanca",
    status: "active",
    confidence: "verified",
    summary:
      "I Comunitat Valenciana defineres vivienda de uso turístico som en hel bolig leid ut med turistformål i inntil 10 sammenhengende dager til samme leietaker. Leie på 11+ dager regnes ikke som VUT etter denne definisjonen, men må vurderes etter annen relevant lovgivning og lokal praksis.",
    customer_message:
      "Med budsjett under 2,5 mill. NOK vil jeg normalt anbefale å se på ferdigstilte boliger først, fordi du ser nøyaktig hva du får og kan vurdere reell utleie- og bruksverdi med en gang. For utleie i Costa Blanca er det viktig å skille mellom turistutleie og lengre opphold. I Valencia-regionen er turistboligreglene rettet mot hele boliger som leies ut med turistformål i opptil 10 sammenhengende dager til samme leietaker. Opphold på 11 dager eller mer faller utenfor denne VUT-definisjonen, men må fortsatt vurderes riktig juridisk, skattemessig og kommunalt. Derfor bør vi se etter boliger som fungerer godt både for egen bruk, lengre sesongopphold og eventuell regulert utleie.",
    internal_notes:
      "Ikke si at lisensen bare er knyttet til personen. Regelverket bruker titular/empresa gestora og identifiserer også selve boligen med unik cadastral reference. Ved salg/eierskifte må titularitet og registrering vurderes. Bruk alltid lokal advokat/gestor for konkret sak.",
    checklist: [
      "Avklar om kjøper ønsker korttidsutleie, sesongutleie, langtidsutleie eller primært egen bruk.",
      "Sjekk kommune/urban compatibility før man lover turistutleie.",
      "Sjekk sameievedtekter/fellesskap før kjøp.",
      "Sjekk cadastral reference og om boligen allerede er registrert som VUT.",
      "For 11+ dagers opphold: vurder kontraktstype, LAU, skatt, forsikring og annonseringskanaler.",
      "Unngå medisinske/juridiske garantier i kundetekst. Bruk 'må sjekkes' og 'avhenger av kommune/bolig'.",
    ],
    sources: [
      {
        label: "BOE / DOGV Decreto-ley 9/2024",
        url: "https://www.boe.es/buscar/doc.php?id=DOGV-r-2024-90168",
        note: "Article 65 defines VUT as whole dwellings rented for <=10 continuous days to same tenant; 11+ days are not VUT under that definition.",
      },
      {
        label: "Turisme GVA FAQ",
        url: "https://www.turisme.gva.es/turisme/es/files/pdf/viviendas_turisticas_012.pdf",
        note: "Explains auto-registration, titulares/gestoras and property data including cadastral reference.",
      },
    ],
    tags: ["rental", "vut", "costa-blanca", "valencia", "buyer-advice"],
    next_review_at: "2026-08-01",
    synthetic: true,
  },
];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeJsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return normalizeList(value);
    }
  }
  return [];
}

function sanitizePlaybook(body: Record<string, unknown>) {
  return {
    brand_id: String(body.brand_id || "zeneco"),
    title: String(body.title || "").trim(),
    topic: String(body.topic || "buyer_advice"),
    region: String(body.region || ""),
    status: String(body.status || "active"),
    confidence: String(body.confidence || "verified"),
    summary: String(body.summary || ""),
    customer_message: String(body.customer_message || ""),
    internal_notes: String(body.internal_notes || ""),
    checklist: normalizeJsonArray(body.checklist),
    sources: normalizeJsonArray(body.sources),
    tags: normalizeList(body.tags),
    next_review_at: body.next_review_at || null,
    updated_at: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ playbooks: seedPlaybooks, synthetic: true });

  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic");
  const brand = searchParams.get("brand");

  let query = supabase
    .from("advisor_playbooks")
    .select("*")
    .order("updated_at", { ascending: false });

  if (topic) query = query.eq("topic", topic);
  if (brand) query = query.eq("brand_id", brand);

  const { data, error } = await query;
  if (error) {
    if (/advisor_playbooks|schema cache|does not exist|relation/i.test(error.message)) {
      return NextResponse.json({ playbooks: seedPlaybooks, synthetic: true, tableNotReady: true });
    }
    return NextResponse.json({ error: error.message, playbooks: [] }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ playbooks: seedPlaybooks, synthetic: true, emptyDatabase: true });
  }

  return NextResponse.json({ playbooks: data, synthetic: false });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const payload = sanitizePlaybook(body);
  if (!payload.title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const { data, error } = await supabase.from("advisor_playbooks").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ playbook: data }, { status: 201 });
}
