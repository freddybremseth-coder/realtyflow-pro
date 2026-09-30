import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { askNexusAI, isNexusAIConfigured } from "@/services/ai/nexus-ai-client";

export const dynamic = "force-dynamic";

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function extractJson(text: string) {
  const cleaned = text.trim().replace(/^\`\`\`(?:json)?/i, "").replace(/\`\`\`$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI response did not contain JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  if (!isNexusAIConfigured()) return NextResponse.json({ error: "Nexus AI is not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const candidateId = String(body?.candidateId || "").trim();
  const source = String(body?.source || "").trim();
  if (!candidateId || !["corporate_buyer", "corporate_partner"].includes(source)) {
    return NextResponse.json({ error: "candidateId and valid source are required" }, { status: 400 });
  }

  const { data: policy, error: policyError } = await supabase
    .from("nexus_autonomy_policies")
    .select("action_class,mode,min_confidence,daily_limit,conditions,rationale")
    .eq("action_class", "outreach_draft")
    .maybeSingle();
  if (policyError) return NextResponse.json({ error: policyError.message }, { status: 500 });
  if (!policy || !["auto", "guarded_auto"].includes(String(policy.mode))) {
    return NextResponse.json({ error: "outreach_draft is not enabled for automatic preparation" }, { status: 409 });
  }

  const table = source === "corporate_partner" ? "corporate_partner_prospects" : "corporate_prospects";
  const { data: candidateRaw, error: candidateError } = await supabase
    .from(table)
    .select("id,company_name,organization_number,domain,website_url,industry,status,fit_tier,fit_score,fit_reasons,evidence_gaps,evidence,next_action" + (source === "corporate_partner" ? ",referral_angle,partner_type" : ""))
    .eq("id", candidateId)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (candidateError) return NextResponse.json({ error: candidateError.message }, { status: 500 });
  if (!candidateRaw) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  const candidate = candidateRaw as Record<string, any>;

  const evidence = objectValue(candidate.evidence);
  const contact = objectValue(evidence.generic_company_contact);
  const signalResearch = objectValue(evidence.company_signal_research);
  const signals = objectValue(signalResearch.signals);
  const officialEmail = String(contact.generic_email || "").trim();
  const contactPage = String(contact.contact_page_url || "").trim();

  if (!officialEmail && !contactPage) {
    return NextResponse.json({ error: "Official company contact channel must be researched before drafting" }, { status: 409 });
  }
  if (contact.personal_data_collected === true || contact.company_level_only === false) {
    return NextResponse.json({ error: "Only verified company-level contact channels may be used" }, { status: 409 });
  }

  const { data: existing } = await supabase
    .from("work_items")
    .select("id,status,title,description,metadata,created_at")
    .eq("source_type", "ai_agent")
    .eq("source_id", candidateId)
    .in("status", ["TO_DO", "REVIEW"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, existing: true, workItem: existing });
  }

  const signalFacts = Object.entries(signals).map(([key, value]) => {
    const detail = objectValue(value);
    return {
      type: key,
      source_url: String(detail.source_url || "").trim() || null,
      matched_terms: Array.isArray(detail.matched_terms) ? detail.matched_terms.map(String) : [],
    };
  });

  const verifiedFacts = {
    company_name: candidate.company_name,
    industry: candidate.industry || null,
    website: candidate.website_url || candidate.domain || null,
    fit_tier: candidate.fit_tier || null,
    fit_score: Number(candidate.fit_score || 0),
    fit_reasons: Array.isArray(candidate.fit_reasons) ? candidate.fit_reasons : [],
    referral_angle: source === "corporate_partner" ? candidate.referral_angle || null : null,
    partner_type: source === "corporate_partner" ? candidate.partner_type || null : null,
    documented_signals: signalFacts,
    official_contact_channel: {
      email: officialEmail || null,
      contact_page: contactPage || null,
      checked_at: contact.checked_at || null,
    },
  };

  const prompt = `Create a concise Norwegian B2B outreach draft for internal review only.

VERIFIED FACTS:
${JSON.stringify(verifiedFacts, null, 2)}

Return JSON only with these keys:
{
  "subject": "...",
  "opening": "...",
  "body": "...",
  "cta": "...",
  "why_this_company": "...",
  "evidence_used": ["..."],
  "risk_notes": ["..."]
}

Rules:
- Write in Norwegian.
- Use only verified facts above. Never invent a person, role, benefit, budget, need, result, relationship, pricing, availability or customer outcome.
- Do not claim the company has a need unless a documented signal directly supports it.
- If evidence is weak, say the contact angle should be exploratory.
- Keep the message short, useful and non-hyped.
- This is a DRAFT only. Do not imply it was sent.
- The CTA should be low pressure and invite a short conversation or point to the relevant company-level information.
- Do not use manipulative urgency, fake familiarity or generic AI hype.`;

  const ai = await askNexusAI(prompt, {
    systemPrompt: "You are Nexus Outbound Drafting. Produce conservative, evidence-grounded Norwegian B2B drafts for human review. Never invent facts and never claim execution.",
    maxTokens: 1600,
  });

  let draft: Record<string, any>;
  try {
    draft = extractJson(ai.text);
  } catch {
    draft = {
      subject: "Mulig samarbeid",
      opening: "",
      body: ai.text.trim(),
      cta: "",
      why_this_company: "",
      evidence_used: [],
      risk_notes: ["AI response was not structured JSON; review carefully before any use."],
    };
  }

  const now = new Date().toISOString();
  const fitScore = Math.max(0, Math.min(100, Number(candidate.fit_score || 0)));
  const { data: workItem, error: insertError } = await supabase
    .from("work_items")
    .insert({
      title: `Outbound-utkast: ${candidate.company_name}`,
      description: String(draft.body || "").slice(0, 8000),
      status: "REVIEW",
      priority: fitScore >= 80 ? "HIGH" : "MEDIUM",
      brand_id: "zeneco",
      source_type: "ai_agent",
      source_id: candidateId,
      assigned_agent: "nexus_outbound_draft",
      next_action: "Menneskelig vurdering: kontroller evidens, kontaktgrunnlag og kanal før eventuell utsendelse.",
      ai_score: fitScore,
      metadata: {
        kind: "outreach_draft",
        source,
        policy_action_class: "outreach_draft",
        send_executed: false,
        external_action_executed: false,
        cold_send_allowed: false,
        official_channel: verifiedFacts.official_contact_channel,
        verified_facts: verifiedFacts,
        draft: {
          subject: String(draft.subject || "").slice(0, 300),
          opening: String(draft.opening || "").slice(0, 1200),
          body: String(draft.body || "").slice(0, 8000),
          cta: String(draft.cta || "").slice(0, 1200),
          why_this_company: String(draft.why_this_company || "").slice(0, 2000),
          evidence_used: Array.isArray(draft.evidence_used) ? draft.evidence_used.map(String).slice(0, 20) : [],
          risk_notes: Array.isArray(draft.risk_notes) ? draft.risk_notes.map(String).slice(0, 20) : [],
        },
        ai_provider: ai.provider,
        ai_model: ai.model,
        prepared_at: now,
      },
      created_at: now,
      updated_at: now,
    })
    .select("id,status,title,description,metadata,created_at")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await supabase.from("automation_logs").insert({
    action: "outreach_draft_prepared",
    agent_name: "nexus_outbound_draft",
    status: "success",
    details: {
      candidate_id: candidateId,
      source,
      company_name: candidate.company_name,
      work_item_id: workItem.id,
      send_executed: false,
      external_action_executed: false,
      policy_action_class: "outreach_draft",
      ai_provider: ai.provider,
      ai_model: ai.model,
    },
    created_at: now,
  });

  return NextResponse.json({ ok: true, existing: false, workItem });
}
