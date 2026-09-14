import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { filterNexusCommands } from "@/lib/nexus-command";
import { assessPipelineMovement } from "@/lib/nexus-pipeline-movement";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { askClaude, isConfigured } from "@/services/ai/claude-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tally(rows: any[], key: string) {
  return rows.reduce((acc: Record<string, number>, row: any) => {
    const value = String(row?.[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function parsePageContext(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return { href: null, pathname: null, contactId: null };
  try {
    const url = new URL(raw, "https://nexus.local");
    const pathMatch = url.pathname.match(/^\/customers\/([0-9a-f-]{36})(?:\/|$)/i);
    const queryContactId = url.searchParams.get("contactId");
    const contactId = pathMatch?.[1] || (queryContactId && /^[0-9a-f-]{36}$/i.test(queryContactId) ? queryContactId : null);
    return { href: raw, pathname: url.pathname, contactId };
  } catch {
    return { href: raw, pathname: raw.startsWith("/") ? raw : null, contactId: null };
  }
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function compactContact(row: any) {
  const activityAt = row.last_inbound_reply_at || row.last_contact || row.updated_at || row.created_at || null;
  const movement = assessPipelineMovement(row);
  return {
    id: row.id,
    name: row.name || row.email || "Ukjent kunde",
    email: row.email || null,
    phone: row.phone || null,
    brand: row.brand_id || row.brand || null,
    pipeline_status: row.pipeline_status || "NEW",
    pipeline_value: numberValue(row.pipeline_value),
    property_interest: row.property_interest || row.preferred_location || null,
    nurture_status: row.nurture_status || null,
    last_activity_at: activityAt,
    next_followup: row.next_followup || null,
    waiting_on: row.waiting_on || null,
    waiting_reason: row.waiting_reason || null,
    movement: movement ? {
      action: movement.action,
      reason: movement.reason,
      target_stage: movement.targetStage,
      priority: movement.priority,
      score: movement.score,
      cause: movement.cause,
      needs_action: movement.needsAction,
      href: `/customers/${encodeURIComponent(String(row.id))}`,
    } : null,
  };
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  if (!isConfigured()) return NextResponse.json({ response: "AI-modellen er ikke konfigurert." }, { status: 503 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ response: "Nexus-databasen er ikke tilgjengelig." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  const conversation = Array.isArray(body?.conversation) ? body.conversation.slice(-10) : [];
  const pageContext = parsePageContext(body?.visitorInfo?.page);
  if (!message) return NextResponse.json({ response: "Hva vil du at Nexus skal vurdere?" });

  const currentContactPromise = pageContext.contactId
    ? supabase
        .from("contacts")
        .select("id,name,email,phone,brand_id,brand,pipeline_status,pipeline_value,nurture_status,property_interest,preferred_location,last_contact,last_inbound_reply_at,next_followup,waiting_on,waiting_reason,waiting_until,updated_at,created_at,email_suppressed,do_not_contact,lost_reason,notes,interactions")
        .eq("id", pageContext.contactId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [sourcesR, channelsR, approvalsR, emailR, contactsR, learningR, autonomyR, focusR, runtimeR, opportunitiesR, currentContactR] = await Promise.all([
    supabase.from("marketing_source_queue").select("brand_id,source_type,status,priority").limit(5000),
    supabase.from("social_channels").select("brand_id,platform,display_name,is_active").eq("is_active", true),
    supabase.from("agentic_approvals").select("status,gated_action_class").in("status", ["pending","approved"]),
    supabase.from("brand_email_configs").select("brand_id,email_address,is_active,auto_fetch,ai_auto_draft,last_fetched_at").eq("is_active", true),
    supabase.from("contacts").select("id,name,email,phone,brand_id,brand,pipeline_status,pipeline_value,nurture_status,property_interest,preferred_location,last_contact,last_inbound_reply_at,next_followup,waiting_on,waiting_reason,waiting_until,updated_at,created_at,email_suppressed,do_not_contact,lost_reason").order("updated_at", { ascending: false }).limit(5000),
    supabase.from("marketing_learning_rules").select("brand_id,status,rule_type").limit(1000),
    supabase.from("nexus_autonomy_policies").select("action_class,mode,min_confidence,daily_limit"),
    supabase.from("nexus_owner_focus").select("brand_id,focus_key,title,notes,intensity,success_definition,review_due_at").eq("status", "active").order("intensity", { ascending: false }),
    supabase.from("nexus_runtime_controls").select("control_key,label,enabled,risk_level").order("category"),
    supabase.from("nexus_business_opportunities").select("contact_id,brand_id,pipeline_id,stage_id,lifecycle_phase,opportunity_state,title,reason,next_action,priority,priority_score,value,currency,last_activity_at,metadata").in("opportunity_state", ["active","won"]).order("priority_score", { ascending: false }).limit(250),
    currentContactPromise,
  ]);

  const sources = sourcesR.data ?? [];
  const channels = channelsR.data ?? [];
  const approvals = approvalsR.data ?? [];
  const emails = emailR.data ?? [];
  const contacts = (contactsR.data ?? []) as any[];
  const learning = learningR.data ?? [];
  const autonomy = autonomyR.data ?? [];
  const ownerFocus = focusR.data ?? [];
  const runtime = runtimeR.data ?? [];
  const opportunities = (opportunitiesR.data ?? []) as any[];

  const activeContacts = contacts.filter((row) => !["WON", "LOST"].includes(String(row.pipeline_status || "NEW").toUpperCase()));
  const wonContacts = contacts.filter((row) => String(row.pipeline_status || "").toUpperCase() === "WON");
  const overdueFollowups = activeContacts.filter((row) => {
    if (!row.next_followup) return false;
    const timestamp = new Date(String(row.next_followup)).getTime();
    return Number.isFinite(timestamp) && timestamp < Date.now();
  });

  const topActions = activeContacts
    .map((row) => compactContact(row))
    .filter((row) => row.movement?.needs_action)
    .sort((a, b) => Number(b.movement?.score || 0) - Number(a.movement?.score || 0) || b.pipeline_value - a.pipeline_value)
    .slice(0, 15);

  const currentContact = currentContactR.data
    ? {
        ...compactContact(currentContactR.data),
        notes: currentContactR.data.notes || null,
        recent_interactions: Array.isArray(currentContactR.data.interactions)
          ? currentContactR.data.interactions.slice(-8)
          : currentContactR.data.interactions || null,
      }
    : null;

  const navigationCandidates = filterNexusCommands(message, 5).map((command) => ({
    label: command.label,
    description: command.description,
    href: command.href,
  }));

  const activeOpportunities = opportunities.filter((row) => String(row.opportunity_state || "").toLowerCase() === "active");
  const wonOpportunities = opportunities.filter((row) => String(row.opportunity_state || "").toLowerCase() === "won");
  const topOpportunities = opportunities.slice(0, 15).map((row) => ({
    contact_id: row.contact_id || null,
    brand_id: row.brand_id || null,
    pipeline_id: row.pipeline_id || null,
    stage_id: row.stage_id || null,
    state: row.opportunity_state || null,
    title: row.title || null,
    reason: row.reason || null,
    next_action: row.next_action || null,
    priority: row.priority || null,
    priority_score: numberValue(row.priority_score),
    value: numberValue(row.value),
    currency: row.currency || "EUR",
    last_activity_at: row.last_activity_at || null,
  }));

  const snapshot = {
    generated_at: new Date().toISOString(),
    page_context: pageContext,
    current_customer: currentContact,
    navigation_candidates: navigationCandidates,
    owner_focus: ownerFocus,
    runtime_controls: runtime,
    sources: { total: sources.length, by_brand: tally(sources, "brand_id"), by_status: tally(sources, "status"), by_type: tally(sources, "source_type") },
    channels: channels.map((x: any) => ({ brand: x.brand_id, platform: x.platform, name: x.display_name })),
    approvals: { total: approvals.length, by_status: tally(approvals, "status"), by_action: tally(approvals, "gated_action_class") },
    email: emails.map((x: any) => ({ brand: x.brand_id, address: x.email_address, auto_fetch: x.auto_fetch, ai_auto_draft: x.ai_auto_draft, last_fetched_at: x.last_fetched_at })),
    crm: {
      contacts_loaded: contacts.length,
      active_contacts: activeContacts.length,
      by_status: tally(contacts, "pipeline_status"),
      nurture: tally(contacts, "nurture_status"),
      active_pipeline_value: activeContacts.reduce((sum, row) => sum + numberValue(row.pipeline_value), 0),
      won_pipeline_value: wonContacts.reduce((sum, row) => sum + numberValue(row.pipeline_value), 0),
      overdue_followups: overdueFollowups.length,
      top_actions: topActions,
    },
    opportunities: {
      loaded: opportunities.length,
      active: activeOpportunities.length,
      won: wonOpportunities.length,
      active_value: activeOpportunities.reduce((sum, row) => sum + numberValue(row.value), 0),
      won_value: wonOpportunities.reduce((sum, row) => sum + numberValue(row.value), 0),
      top: topOpportunities,
    },
    learning: { total: learning.length, by_status: tally(learning, "status"), by_type: tally(learning, "rule_type") },
    autonomy,
    read_warnings: [
      contactsR.error ? `CRM kunne ikke leses komplett: ${contactsR.error.message}` : null,
      opportunitiesR.error ? `Opportunity Store kunne ikke leses komplett: ${opportunitiesR.error.message}` : null,
      currentContactR.error ? `Aktuell kunde kunne ikke leses: ${currentContactR.error.message}` : null,
    ].filter(Boolean),
  };

  const history = conversation.map((m: any) => `${m.role === "assistant" ? "Nexus AI" : "Bruker"}: ${String(m.content ?? "")}`).join("\n");
  const prompt = `${history ? `${history}\n` : ""}Bruker: ${message}\n\nLIVE NEXUS SNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}`;
  const systemPrompt = `Du er Nexus AI, den innebygde rådgiveren i RealtyFlow Pro / Nexus OS. Du skal oppleves som en erfaren salgsleder, CRM-rådgiver, systemguide og operativ assistent i samme chat. Nexus-dataene i snapshot er sannhetskilden.

HOVEDOPPGAVE:
- Svar på spørsmål om kunder, leads, CRM, pipeline, salgstall, markedsføring, systemstatus og prioriteringer.
- Når brukeren spør «hva bør jeg gjøre i dag?», bruk crm.top_actions, opportunities, owner_focus, approvals og runtime-status til å prioritere et lite antall konkrete handlinger med begrunnelse.
- Når brukeren spør «hvor finner jeg …?» eller «hvor skal jeg trykke?», bruk navigation_candidates og oppgi riktig modul/side. Ikke finn på menyer eller ruter.
- Når page_context/current_customer finnes og brukeren sier «denne kunden», «her», «denne siden» eller lignende, behandle current_customer som aktiv kontekst uten å be brukeren gjenta hvem det gjelder.
- Når brukeren spør hvordan systemet kan gjøre noe, forklar først hva RealtyFlow allerede kan gjøre, hvilken modul som eier funksjonen, og hva som eventuelt mangler. Skill tydelig mellom eksisterende funksjon, anbefalt konfigurasjon og ny utvikling.
- Bruk konkrete kundenavn fra crm.top_actions når spørsmålet gjelder hvem som bør kontaktes. Ikke begrens deg til summeringer når konkrete rader finnes.

SIKKERHET OG SANNHET:
- Denne chatten er read-only i v1. Den kan analysere, prioritere, forklare og navigere, men skal ikke påstå at den har sendt e-post, endret CRM, flyttet pipeline, godkjent noe eller utført andre sideeffekter.
- Ikke late som en handling er utført hvis snapshot eller execution-logg ikke viser det.
- Skill tydelig mellom planned/draft/approved/applied/published/measured.
- Respekter runtime_controls og autonomy-policy. En funksjon som er AV eller BLOCKED skal ikke omtales som aktiv.
- Kunde-bekreftede fakta skal veie tyngre enn modellens antakelser. Ikke oppfinn pris, tilgjengelighet, avtalevilkår eller juridiske/økonomiske fakta.
- Hvis snapshot mangler data som kreves for et eksakt svar, si presist hva som mangler i stedet for å gjette.
- Pipeline- og opportunity-value er beslutningsstøtte, ikke automatisk det samme som bokført omsetning. Forklar dette hvis brukeren spør om faktisk omsetning.

OWNER FOCUS:
- owner_focus er eksplisitte prioriteringer fra eier og skal veie tyngre enn normal porteføljebalanse.
- Knyt anbefalinger til success_definition når den finnes, men owner focus kan aldri omgå sikkerhets-, budsjett-, kanal- eller approval-regler.

STIL:
- Svar på norsk med mindre brukeren ber om annet språk.
- Vær kort når spørsmålet er enkelt. Ved prioritering: start med anbefalingen, deretter hvorfor.
- Unngå å dumpe dashboards. Gjør data om til beslutninger og neste steg.
- Når brukeren kommer med mange ideer samtidig, organiser dem i beslutning / oppgave / forslag / måling uten å miste intensjonen.`;

  try {
    const response = await askClaude(prompt, { systemPrompt, maxTokens: 1900, model: "sonnet" });
    return NextResponse.json({
      response,
      actions: navigationCandidates,
      pageContext,
      snapshotGeneratedAt: snapshot.generated_at,
      activeOwnerFocus: ownerFocus.length,
    });
  } catch (e) {
    return NextResponse.json({ response: `Nexus AI klarte ikke å lese Nexus akkurat nå: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
