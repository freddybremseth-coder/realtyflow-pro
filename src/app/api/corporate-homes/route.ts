import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getContactsSupabase } from "@/app/api/contacts/supabase-client";
import { corporateLeadProfile, isCorporateHomeLead } from "@/lib/corporate-homes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function dateValue(value: unknown) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { leads: [], summary: null });
  if (denied) return denied;

  const supabase = getContactsSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Contacts database is not configured", leads: [], summary: null }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("brand_id", "zeneco")
    .order("updated_at", { ascending: false })
    .limit(2500);

  if (error) return NextResponse.json({ error: error.message, leads: [], summary: null }, { status: 500 });

  const now = Date.now();
  const leads = (data || [])
    .filter((contact: any) => isCorporateHomeLead(contact))
    .map((contact: any) => {
      const profile = corporateLeadProfile(contact);
      const followupAt = dateValue(contact.next_followup);
      const overdue = followupAt > 0 && followupAt < now && !["WON", "LOST"].includes(String(contact.pipeline_status || "").toUpperCase());
      return {
        id: String(contact.id),
        name: contact.name || contact.email || "Ukjent kontakt",
        email: contact.email || null,
        phone: contact.phone || null,
        pipelineStatus: String(contact.pipeline_status || "NEW").toUpperCase(),
        pipelineValue: Number(contact.pipeline_value || 0) || 0,
        source: contact.source || null,
        propertyInterest: contact.property_interest || null,
        nextFollowup: contact.next_followup || null,
        updatedAt: contact.updated_at || null,
        overdue,
        ...profile,
      };
    })
    .sort((a, b) => b.score - a.score || dateValue(b.updatedAt) - dateValue(a.updatedAt));

  const active = leads.filter((lead) => !["WON", "LOST"].includes(lead.pipelineStatus));
  const summary = {
    total: leads.length,
    active: active.length,
    highPriority: active.filter((lead) => lead.priority === "CRITICAL" || lead.priority === "HIGH").length,
    overdue: active.filter((lead) => lead.overdue).length,
    pipelineValue: active.reduce((sum, lead) => sum + (lead.pipelineValue || 0), 0),
    won: leads.filter((lead) => lead.pipelineStatus === "WON").length,
  };

  return NextResponse.json({
    leads,
    summary,
    playbook: {
      landingPage: "https://www.zenecohomes.com/bedriftshytte-spania",
      primaryMarkets: ["Norge"],
      decisionRoles: ["Daglig leder / CEO", "HR / People", "CFO / økonomi", "Styreleder", "Organisasjonsleder"],
      searchThemes: [
        "bedriftshytte Spania",
        "firmahytte Spania",
        "bedriftsleilighet Spania",
        "firmahytte utlandet",
        "bolig i Spania for ansatte",
        "medlemsbolig Spania",
      ],
      trackedLandingPages: {
        google: "https://www.zenecohomes.com/bedriftshytte-spania?utm_source=google&utm_medium=cpc&utm_campaign=corporate_homes_no",
        linkedin: "https://www.zenecohomes.com/bedriftshytte-spania?utm_source=linkedin&utm_medium=paid_social&utm_campaign=corporate_homes_no",
        organicLinkedIn: "https://www.zenecohomes.com/bedriftshytte-spania?utm_source=linkedin&utm_medium=organic&utm_campaign=corporate_homes_no",
        outreach: "https://www.zenecohomes.com/bedriftshytte-spania?utm_source=outreach&utm_medium=email&utm_campaign=corporate_homes_no",
      },
      googleSearchDraft: {
        campaign: "Zen Corporate Homes | Norway | Search",
        adGroups: [
          {
            name: "Bedriftshytte Spania",
            keywords: ["bedriftshytte spania", "firmahytte spania", "firmahytte utlandet", "kjøpe firmahytte"],
          },
          {
            name: "Bolig for ansatte",
            keywords: ["bolig i spania for ansatte", "bedriftsleilighet spania", "feriebolig ansatte"],
          },
          {
            name: "Organisasjon og medlemmer",
            keywords: ["medlemsbolig spania", "leilighet spania forening", "feriebolig forening"],
          },
        ],
        headlines: [
          "Bedriftshytte i Spania",
          "Firmahytte på Costa Blanca",
          "Bolig for ansatte i Spania",
          "Zen Corporate Homes",
          "Få en bedriftsvurdering",
          "Fra idé til nøkkel i Spania",
        ],
        descriptions: [
          "Vi hjelper bedrifter å finne, kjøpe og følge opp bolig i Spania for ansatte.",
          "Se modeller, kalkulator og lokal drift. Få en uforpliktende bedriftsvurdering.",
        ],
        negatives: ["langtidsleie", "airbnb", "billig ferie", "hotell", "privat utleie"],
      },
      linkedinAngles: [
        "Et ansattgode som faktisk blir brukt",
        "Fra norsk firmahytte til Costa Blanca",
        "50 ansatte. Én bolig i Spania.",
        "Et langsiktig medlemsfordel-konsept med lokal drift",
      ],
      linkedinDraft: {
        market: "Norway",
        companySizes: ["11–50", "51–200", "201–500", "501–1 000"],
        professionalFunctions: ["Ledelse", "HR / People", "Økonomi / Finance", "Administrasjon"],
        seniority: ["Owner", "CXO", "Director", "Manager"],
        primaryCopy: "50 ansatte. Én bolig i Spania. Zen Corporate Homes hjelper bedrifter og organisasjoner med boligvalg, kjøpsprosess, beslutningsgrunnlag og lokal oppfølging på Costa Blanca.",
        cta: "Få en bedriftsvurdering",
      },
      policyGuardrails: [
        "Behandle kampanjen som bolig/eiendom når annonseplattformen krever kategorisering.",
        "Ikke målrett eller ekskluder basert på beskyttede personopplysninger som kjønn, etnisitet, religion eller andre sensitive kjennetegn.",
        "På LinkedIn: bruk profesjonelle kriterier som rolle, funksjon og virksomhetstype, og fullfør eventuell housing-sertifisering.",
        "Ikke lov skattefrihet, avkastning eller juridisk godkjenning i annonseteksten.",
      ],
      qualificationQuestions: [
        "Hvor mange ansatte eller medlemmer skal ha tilgang?",
        "Hvem tar investeringsbeslutningen, og når?",
        "Hvilket budsjett eller investeringsramme vurderes?",
        "Skal boligen være et rent ansatt-/medlemsgode eller også brukes i virksomheten?",
        "Hvordan ønsker dere å fordele attraktive uker?",
        "Har dere norsk og spansk rådgiver for skatt, regnskap og eierstruktur?",
      ],
    },
  });
}
