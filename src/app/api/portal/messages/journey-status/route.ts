import { NextRequest, NextResponse } from "next/server";
import { normalizeRealEstateStage } from "@/lib/customers/action-priority";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

type CustomerStage = "NEW" | "CONTACT" | "QUALIFIED" | "MATCHING" | "VIEWING" | "NEGOTIATION" | "RESERVED" | "ON_HOLD" | "WON";
type Journey = { title: string; description: string; nextStep: string; progress: number; completed: boolean; paused?: boolean };

const JOURNEY: Record<CustomerStage, Journey> = {
  NEW: { title: "Vi starter med behovene dine", description: "Vi samler informasjon om budsjett, områder og hvordan du ønsker å bruke boligen.", nextStep: "Neste steg er å avklare behovene og rammene for boligjakten.", progress: 10, completed: false },
  CONTACT: { title: "Vi kartlegger boligønskene dine", description: "Dialogen er i gang, og vi bygger et tydeligere bilde av hva som passer deg.", nextStep: "Vi avklarer de viktigste valgene før vi begynner å snevre inn boligene.", progress: 20, completed: false },
  QUALIFIED: { title: "Behov og budsjett er avklart", description: "Vi har et godt nok grunnlag til å begynne å finne relevante alternativer.", nextStep: "Neste steg er å velge områder og bygge en kort, relevant boligliste.", progress: 35, completed: false },
  MATCHING: { title: "Vi finner og vurderer aktuelle boliger", description: "Vi sammenligner boliger mot ønskene dine og sorterer bort alternativer som ikke passer.", nextStep: "Marker gjerne boliger som interessante eller ikke for deg. Det gjør neste utvalg mer presist.", progress: 50, completed: false },
  VIEWING: { title: "Visninger planlegges eller gjennomføres", description: "Vi konsentrerer oss om de mest aktuelle boligene og forsøker å gjøre visningsdagene effektive.", nextStep: "Neste steg er å vurdere boligene etter visning og avgjøre hvilke som skal undersøkes videre.", progress: 65, completed: false },
  NEGOTIATION: { title: "En aktuell bolig vurderes nærmere", description: "Pris, vilkår eller andre viktige detaljer avklares før en beslutning.", nextStep: "Neste steg er å få de nødvendige avklaringene før du bestemmer deg for å gå videre.", progress: 78, completed: false },
  RESERVED: { title: "Boligen er reservert", description: "Prosessen går videre med dokumentasjon, kontroller og avtalte steg frem mot gjennomføring.", nextStep: "Følg dokumentasjonen og milepælene frem mot signering og overtakelse.", progress: 88, completed: false },
  ON_HOLD: { title: "Boligjakten er satt på pause", description: "Vi har registrert at prosessen skal vente en periode før vi fortsetter.", nextStep: "Vi tar opp tråden igjen når tidspunktet er riktig for deg.", progress: 40, completed: false, paused: true },
  WON: { title: "Kjøpsprosessen er gjennomført", description: "Boligkjøpet er registrert som gjennomført. Videre oppfølging kan fortsette etter behov.", nextStep: "Ta kontakt når du trenger praktisk oppfølging, nøkkelhåndtering eller annen hjelp etter kjøpet.", progress: 100, completed: true },
};

function stageOf(value: unknown): CustomerStage {
  const stage = normalizeRealEstateStage(value);
  return (["CONTACT","QUALIFIED","MATCHING","VIEWING","NEGOTIATION","RESERVED","ON_HOLD","WON"] as string[]).includes(stage) ? stage as CustomerStage : "NEW";
}
function iso(value: unknown) { if (!value) return null; const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }

export async function GET(request: NextRequest) {
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing portal session" }, { status: 401 });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user?.email) return NextResponse.json({ error: "Invalid portal session" }, { status: 401 });
  const email = userData.user.email.trim().toLowerCase();
  const { data: contact, error } = await supabase.from("contacts").select("pipeline_status,next_followup,waiting_until,email_suppressed,do_not_contact,updated_at").ilike("email", email).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Portal contact not found" }, { status: 404 });
  const normalized = normalizeRealEstateStage(contact.pipeline_status);
  if (normalized === "LOST" || contact.email_suppressed || contact.do_not_contact) return NextResponse.json({ error: "Portal access is not active for this contact" }, { status: 403 });
  const stage = stageOf(normalized); const j = JOURNEY[stage];
  return NextResponse.json({ stage, ...j, paused: Boolean(j.paused), nextFollowup: iso(contact.next_followup), waitingUntil: iso(contact.waiting_until), updatedAt: iso(contact.updated_at) }, { headers: { "cache-control": "private, no-store" } });
}
