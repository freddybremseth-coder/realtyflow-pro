import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
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

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  if (!isConfigured()) return NextResponse.json({ response: "AI-modellen er ikke konfigurert." }, { status: 503 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ response: "Nexus-databasen er ikke tilgjengelig." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  const conversation = Array.isArray(body?.conversation) ? body.conversation.slice(-8) : [];
  if (!message) return NextResponse.json({ response: "Hva vil du at Nexus skal vurdere?" });

  const [sourcesR, channelsR, approvalsR, emailR, contactsR, learningR, autonomyR] = await Promise.all([
    supabase.from("marketing_source_queue").select("brand_id,source_type,status,priority").limit(5000),
    supabase.from("social_channels").select("brand_id,platform,display_name,is_active").eq("is_active", true),
    supabase.from("agentic_approvals").select("status,gated_action_class").in("status", ["pending","approved"]),
    supabase.from("brand_email_configs").select("brand_id,email_address,is_active,auto_fetch,ai_auto_draft,last_fetched_at").eq("is_active", true),
    supabase.from("contacts").select("brand_id,pipeline_status,nurture_status").limit(5000),
    supabase.from("marketing_learning_rules").select("brand_id,status,rule_type").limit(1000),
    supabase.from("nexus_autonomy_policies").select("action_class,mode,min_confidence,daily_limit"),
  ]);

  const sources = sourcesR.data ?? [];
  const channels = channelsR.data ?? [];
  const approvals = approvalsR.data ?? [];
  const emails = emailR.data ?? [];
  const contacts = contactsR.data ?? [];
  const learning = learningR.data ?? [];
  const autonomy = autonomyR.data ?? [];

  const snapshot = {
    generated_at: new Date().toISOString(),
    sources: { total: sources.length, by_brand: tally(sources, "brand_id"), by_status: tally(sources, "status"), by_type: tally(sources, "source_type") },
    channels: channels.map((x: any) => ({ brand: x.brand_id, platform: x.platform, name: x.display_name })),
    approvals: { total: approvals.length, by_status: tally(approvals, "status"), by_action: tally(approvals, "gated_action_class") },
    email: emails.map((x: any) => ({ brand: x.brand_id, address: x.email_address, auto_fetch: x.auto_fetch, ai_auto_draft: x.ai_auto_draft, last_fetched_at: x.last_fetched_at })),
    crm: { contacts: contacts.length, by_status: tally(contacts, "pipeline_status"), nurture: tally(contacts, "nurture_status") },
    learning: { total: learning.length, by_status: tally(learning, "status"), by_type: tally(learning, "rule_type") },
    autonomy,
  };

  const history = conversation.map((m: any) => `${m.role === "assistant" ? "Victoria" : "Freddy"}: ${String(m.content ?? "")}`).join("\n");
  const prompt = `${history ? `${history}\n` : ""}Freddy: ${message}\n\nLIVE NEXUS SNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}`;
  const systemPrompt = `Du er Victoria, brukergrensesnittet til Nexus OS i RealtyFlow Pro. Nexus — ikke Victoria — er systemets director og sannhetskilde. Du skal tolke live-data, forklare hva som skjer, prioritere neste handling og fortelle hvilke eksisterende Nexus-moduler som bør utføre arbeidet.

Regler:
- Ikke late som en handling er utført hvis snapshot eller execution-logg ikke viser det.
- Skill tydelig mellom planned/draft/approved/applied/published/measured.
- Bruk autonomy-policyen i snapshot. AUTO og GUARDED_AUTO kan anbefales for 24/7 execution når betingelsene er oppfylt. APPROVAL/BLOCKED skal ikke omgås.
- Prioriter leads, salg, respons, læring og datakvalitet fremfor aktivitetsvolum.
- Ikke anbefal masse-likes, masse-kommentarer, kald DM eller kald e-post som autonom vekstmetode. Nexus kan foreslå relevante kontoer og manuelle/organiske engagement opportunities.
- For e-post: rutinesvar og nurture kan automatiseres når mottaker, sender, fakta og confidence er tydelige. Juridiske, økonomiske eller bindende løfter skal eskaleres.
- Svar kort på norsk. Ved behov: 1) status, 2) hva Nexus bør gjøre nå, 3) hva som er blokkert/mangler.`;

  try {
    const response = await askClaude(prompt, { systemPrompt, maxTokens: 1200, model: "sonnet" });
    return NextResponse.json({ response, snapshotGeneratedAt: snapshot.generated_at });
  } catch (e) {
    return NextResponse.json({ response: `Victoria klarte ikke å lese Nexus akkurat nå: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
