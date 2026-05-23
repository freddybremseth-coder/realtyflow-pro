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
  {
    id: "seed-costa-blanca-buyer-report",
    brand_id: "zeneco",
    title: "Kjøperrapport: slik vurderer du bolig i Costa Blanca før reservasjon",
    topic: "expert_report",
    region: "Costa Blanca",
    status: "active",
    confidence: "needs_review",
    summary:
      "En profesjonell kjøperrapport som hjelper norske boligkjøpere å vurdere område, boligtype, dokumentasjon, risiko og neste steg før de binder seg til reservasjon.",
    customer_message:
      "Kjøperrapport: slik vurderer du bolig i Costa Blanca før reservasjon\n\nHovedkonklusjon\nEn god boligbeslutning i Costa Blanca handler ikke bare om fin utsikt, pris og antall soverom. Den handler om hvor godt boligen passer faktisk bruk, hvor lett den kan eies og driftes, og hvilke forhold som må kontrolleres før reservasjon.\n\n1. Avklar kjøpsformålet først\nKjøper du for feriebruk, flytting, investering, utleie eller en kombinasjon? Samme bolig kan være et godt kjøp for egen bruk, men et svakt kjøp for utleie hvis beliggenhet, sameieregler eller lokale begrensninger ikke passer planen.\n\n2. Vurder området som et bruksområde, ikke bare som et kartpunkt\nSe på helårsaktivitet, avstand til tjenester, transport, strand/by, helsetilbud, støy, parkering og vedlikeholdsbehov. To boliger med lik pris kan ha helt ulik risiko fordi området fungerer forskjellig gjennom året.\n\n3. Kontroller dokumentasjon tidlig\nFør kjøper går videre bør man kontrollere eiendomsdata, sameiekostnader, eventuelle heftelser, byggestatus, energiforhold, lisenshistorikk og om boligen har praktiske eller juridiske begrensninger.\n\n4. Skill mellom pris og verdi\nLav pris er ikke nok hvis boligen blir dyr å eie, vanskelig å leie ut, krevende å selge videre eller avhengig av forutsetninger som ikke er verifisert. En god vurdering inkluderer både mulighet og risiko.\n\nAnbefalt neste steg\nFør reservasjon bør boligen gjennomgås med en konkret sjekkliste for område, dokumentasjon, kostnader, bruk og eventuelle utleieplaner. Juridiske, skattemessige og kommunale spørsmål må bekreftes av advokat, gestor eller relevant myndighet.",
    internal_notes:
      "Bruk denne som utgangspunkt for rapporter til kjøpere. Legg inn konkrete områdefunn, prisdata, dokumentstatus og advokat/gestor-forbehold før publisering.",
    checklist: [
      "Avklar formålet med kjøpet før boliger sammenlignes.",
      "Vurder område som helårs bruksområde, ikke bare beliggenhet.",
      "Kontroller sameie, kostnader, dokumentasjon og eventuelle heftelser.",
      "Sjekk lokale utleie- og bruksbegrensninger før investeringscase presenteres.",
      "Skill tydelig mellom dokumenterte fakta, faglig vurdering og forbehold.",
      "Avslutt rapporten med anbefalt neste steg for kjøper.",
    ],
    sources: [
      {
        label: "Colegio de Registradores",
        url: "https://www.registradores.org/",
        note: "Eiendomsregister og dokumentkontroll bør avklares før kjøper forplikter seg.",
      },
      {
        label: "Notariado",
        url: "https://www.notariado.org/",
        note: "Relevant for kjøpsprosess, skjøte og formelle avklaringer.",
      },
    ],
    tags: ["report", "buyer-advice", "costa-blanca", "due-diligence", "expert-content"],
    next_review_at: "2026-08-01",
    synthetic: true,
  },
  {
    id: "seed-expert-article-rental-myths",
    brand_id: "zeneco",
    title: "Artikkel: den vanligste feilen nordmenn gjør når de vurderer utleie i Spania",
    topic: "expert_article",
    region: "Spania",
    status: "active",
    confidence: "needs_review",
    summary:
      "En ekspertartikkel som bygger tillit ved å forklare hvorfor kjøpere må skille mellom ønsket utleie, lovlig utleie, praktisk drift og reell nettoverdi.",
    customer_message:
      "Den vanligste feilen nordmenn gjør når de vurderer utleie i Spania\n\nMange starter med spørsmålet: Hvor mye kan jeg leie ut boligen for? Det bedre spørsmålet er: Har denne boligen faktisk forutsetningene som gjør utleie lovlig, praktisk og økonomisk fornuftig?\n\nUtleie i Spania er ikke ett enkelt marked. Reglene varierer mellom regioner, kommuner, boligtyper og sameier. I tillegg må man se på skatt, forsikring, administrasjon, sesong, vedlikehold og hvor attraktiv boligen er utenfor høysesong.\n\nMin vurdering er at kjøpere bør tenke i tre lag:\n\n1. Lovlig mulighet\nKan boligen brukes slik kjøper ønsker, og hva må bekreftes av kommune, region, advokat eller gestor?\n\n2. Praktisk drift\nHvem håndterer nøkler, rengjøring, gjester, skader, klager, vedlikehold og kommunikasjon når eier er i Norge?\n\n3. Reell nettoverdi\nBrutto leieinntekter sier lite uten kostnader, ledighet, skatt, plattformavgifter, drift og slitasje.\n\nDet er ikke feil å kjøpe med utleie som del av planen. Feilen er å kjøpe en bolig basert på en generell utleieidé uten at boligen, området og regelverket er kontrollert konkret.\n\nAnbefalt neste steg\nFør du lar utleie bli en del av regnestykket, bør boligen vurderes med en konkret utleiesjekk: region, kommune, sameie, boligdata, drift og realistisk netto.",
    internal_notes:
      "Artikkelen bør tilpasses region før publisering. Unngå absolutte juridiske formuleringer. Bruk den som thought leadership og inngang til rådgivningssamtale.",
    checklist: [
      "Ikke lov generell utleieadgang uten konkret kontroll.",
      "Forklar forskjell på brutto og netto utleieverdi.",
      "Skill mellom turistutleie, sesongutleie og langtidsutleie.",
      "Nevn drift, forsikring, skatt og sameie som separate risikopunkter.",
      "Avslutt med tilbud om konkret vurdering av bolig og område.",
    ],
    sources: [
      {
        label: "Agencia Tributaria",
        url: "https://sede.agenciatributaria.gob.es/",
        note: "Skatt og rapporteringsplikt må vurderes konkret.",
      },
      {
        label: "BOE",
        url: "https://www.boe.es/",
        note: "Offisielle lovtekster og regionale publiseringer.",
      },
    ],
    tags: ["article", "rental", "buyer-advice", "spain", "expert-content"],
    next_review_at: "2026-08-01",
    synthetic: true,
  },
  {
    id: "seed-instruction-property-review",
    brand_id: "zeneco",
    title: "Instruks: intern kvalitetssjekk før kjøper får anbefaling",
    topic: "advisor_instruction",
    region: "Spania",
    status: "active",
    confidence: "verified",
    summary:
      "En intern prosess for å gjøre kjøperrådgivning mer profesjonell: fra behovsavklaring til dokumentkontroll, risikovurdering og trygg formulering.",
    customer_message:
      "Instruks: intern kvalitetssjekk før kjøper får anbefaling\n\nFormål\nSikre at rådgivning til kjøper er konkret, etterprøvbar og trygg før vi anbefaler bolig, område eller neste steg.\n\n1. Start med kjøpers plan\nAvklar budsjett, tidshorisont, egen bruk, flytting, utleie, finansiering, risikotoleranse og ønsket område.\n\n2. Kontroller boligens basisdata\nSamle adresse, cadastral reference hvis tilgjengelig, boligtype, areal, kostnader, sameie, byggeår, energiforhold og dokumentstatus.\n\n3. Vurder området praktisk\nSjekk helårsfunksjon, transport, tjenester, støy, tilgjengelighet, parkering, strand/by-avstand og salgbarhet.\n\n4. Marker risikopunkter\nNoter hva som er sikkert, hva som er antakelse, og hva advokat, gestor, kommune eller sameie må bekrefte.\n\n5. Skriv anbefalingen\nStart med konklusjon, forklar hvorfor, vis risiko og avslutt med neste handling. Ikke bruk juridiske garantier.\n\nStandard formulering\nBasert på informasjonen vi har nå virker dette som en bolig som kan passe planen din, men før vi anbefaler videre steg bør dokumentasjon, sameie, lokale regler og kostnadsbildet kontrolleres konkret.",
    internal_notes:
      "Bruk som intern SOP for rådgivere og AI-agenter. Kan sendes til HUB som oppgave før større kjøperrapport eller visningsplan.",
    checklist: [
      "Behov, budsjett og bruk er dokumentert.",
      "Boligens basisdata og kostnader er samlet.",
      "Område er vurdert praktisk, ikke bare estetisk.",
      "Risiko er delt inn i sikker fakta, antakelse og tredjepartsavklaring.",
      "Anbefaling inneholder konklusjon, begrunnelse, forbehold og neste steg.",
    ],
    sources: [
      {
        label: "Catastro",
        url: "https://www.sedecatastro.gob.es/",
        note: "Cadastral reference og eiendomsdata kan være relevant i kontrollarbeid.",
      },
    ],
    tags: ["instruction", "sop", "buyer-advice", "quality", "expert-content"],
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

function supabaseProjectHost() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
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
      return NextResponse.json({
        playbooks: seedPlaybooks,
        synthetic: true,
        tableNotReady: true,
        dbError: error.message,
        supabaseHost: supabaseProjectHost(),
      });
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

  const { data: existing, error: lookupError } = await supabase
    .from("advisor_playbooks")
    .select("id")
    .eq("brand_id", payload.brand_id)
    .eq("title", payload.title)
    .limit(1);

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });

  if (existing?.[0]?.id) {
    const { data, error } = await supabase
      .from("advisor_playbooks")
      .update(payload)
      .eq("id", existing[0].id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ playbook: data, updated: true });
  }

  const { data, error } = await supabase.from("advisor_playbooks").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ playbook: data }, { status: 201 });
}
