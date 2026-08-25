import type { SupabaseClient } from "@supabase/supabase-js";
import { EmailAgent } from "@/services/agents/email-agent";
import { BRANDS } from "@/lib/constants";

function buildLearningContext(rows: any[]) {
  const eligible = (rows || [])
    .filter((row) => row?.status === "active")
    .filter((row) => ["prefer", "avoid"].includes(String(row?.verdict || "").toLowerCase()))
    .filter((row) => ["moderate", "strong"].includes(String(row?.evidence || "").toLowerCase()))
    .filter((row) => Number(row?.sample || 0) >= 10)
    .slice(0, 8);

  if (!eligible.length) return { text: "", rules: [] as any[] };

  const lines = eligible.map((row) => {
    const verdict = String(row.verdict).toLowerCase() === "prefer" ? "FORETREKK" : "UNNGÅ";
    const finding = String(row.finding || "").trim();
    const metrics = [
      `sample=${Number(row.sample || 0)}`,
      row.reply_rate == null ? null : `reply=${Math.round(Number(row.reply_rate) * 100)}%`,
      row.avg_edit_ratio == null ? null : `edit=${Math.round(Number(row.avg_edit_ratio) * 100)}%`,
    ].filter(Boolean).join(", ");
    return `- ${verdict} ${row.dimension}=${row.value}${finding ? `: ${finding}` : ""} (${metrics}; evidens=${row.evidence})`;
  });

  return {
    text: `\nNEXUS KOMMUNIKASJONSLÆRING (evidensstyrt):\n${lines.join("\n")}\nBruk dette som en svak preferanse, ikke som en absolutt regel. Original e-post, fakta, brand-policy og sikkerhet har alltid høyere prioritet.`,
    rules: eligible.map((row) => ({ id: row.id, dimension: row.dimension, value: row.value, verdict: row.verdict, evidence: row.evidence, sample: row.sample })),
  };
}

export async function processEmailMessage(supabase: SupabaseClient, emailId: string) {
  const { data: email, error: emailError } = await supabase
    .from("email_messages")
    .select("*")
    .eq("id", emailId)
    .single();
  if (emailError || !email) throw new Error("Email not found");

  const brand = BRANDS.find((b) => b.id === email.brand_id);
  const [{ data: emailConfig }, { data: learningRows }] = await Promise.all([
    supabase
      .from("brand_email_configs")
      .select("signature, display_name, email_address")
      .eq("brand_id", email.brand_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("nexus_communication_learning_rules")
      .select("id,brand_id,dimension,value,sample,avg_edit_ratio,reply_rate,evidence,verdict,finding,status")
      .eq("brand_id", email.brand_id)
      .eq("status", "active")
      .order("sample", { ascending: false })
      .limit(20),
  ]);

  const [{ data: leads }, { data: customers }, { data: properties }] = await Promise.all([
    supabase.from("leads").select("id, first_name, last_name, email, phone, status, budget, notes").limit(100),
    supabase.from("customers").select("id, name, email, phone, status, customer_type, notes").limit(100),
    supabase.from("properties").select("id, ref, price, property_type, location, bedrooms, bathrooms, built_area, plot_size, pool, title_no, title_en, title_es, primary_image, gallery").limit(200),
  ]);

  const learning = buildLearningContext(learningRows || []);
  const brandContext = brand
    ? `Brand: ${brand.name}\nType: ${brand.type}\nTone: ${brand.tone || "professional"}\nMålgruppe: ${brand.target_audience || ""}\nSpesialiteter: ${brand.specialties?.join(", ") || ""}\nNettside: ${brand.website || ""}${learning.text}`
    : learning.text;

  const agent = new EmailAgent(brandContext);
  const result = await agent.processEmail({
    subject: email.subject || "",
    body: email.body_text || email.body_html || "",
    from_address: email.from_address,
    from_name: email.from_name || undefined,
    brand_info: brand ? {
      name: brand.name,
      tone: brand.tone,
      target_audience: brand.target_audience,
      specialties: brand.specialties,
      website: brand.website,
    } : undefined,
    leads: (leads || []).map((l: any) => ({ id:l.id, name:`${l.first_name || ""} ${l.last_name || ""}`.trim(), email:l.email, phone:l.phone, status:l.status, budget:l.budget })),
    customers: (customers || []).map((c: any) => ({ id:c.id, name:c.name, email:c.email, phone:c.phone, status:c.status, type:c.customer_type })),
    properties: (properties || []).map((p: any) => ({ id:p.id, ref:p.ref, price:p.price, type:p.property_type, location:p.location, bedrooms:p.bedrooms, bathrooms:p.bathrooms, area:p.built_area, plot_size:p.plot_size, pool:p.pool, title:p.title_no || p.title_en || p.title_es, primary_image:p.primary_image, gallery:p.gallery })),
    signature: emailConfig?.signature || `Med vennlig hilsen\n${emailConfig?.display_name || brand?.name || ""}`,
  });

  const { error: updateError } = await supabase.from("email_messages").update({
    ai_summary: result.analysis.summary,
    ai_intent: result.analysis.intent,
    ai_language: result.analysis.language,
    ai_urgency: result.analysis.urgency,
    ai_sentiment: result.analysis.sentiment,
    ai_suggested_action: result.analysis.suggested_action,
    matched_lead_id: result.contextMatch.matched_lead_id || null,
    matched_customer_id: result.contextMatch.matched_customer_id || null,
    matched_property_ids: result.contextMatch.matched_property_ids || [],
    matched_plot_ids: result.contextMatch.matched_plot_ids || [],
    has_draft_reply: true,
  }).eq("id", emailId);
  if (updateError) throw new Error(`Email update failed: ${updateError.message}`);

  const { data: existingDraft } = await supabase
    .from("email_drafts")
    .select("id,ai_context")
    .eq("email_message_id", emailId)
    .eq("status", "draft")
    .order("created_at", { ascending:false })
    .limit(1)
    .maybeSingle();

  const originalDraft = {
    subject: result.draftReply.subject,
    body_text: result.draftReply.body_text,
    tone: result.draftReply.tone,
    language: result.draftReply.language,
    confidence: result.draftReply.confidence,
    generated_at: new Date().toISOString(),
  };

  const draftPayload = {
    email_message_id: emailId,
    brand_id: email.brand_id,
    to_addresses: [email.from_address],
    subject: result.draftReply.subject,
    body_text: result.draftReply.body_text,
    body_html: result.draftReply.body_html || null,
    ai_model: "claude-sonnet-4",
    ai_context: {
      analysis: result.analysis,
      context_match: result.contextMatch,
      properties_mentioned: result.draftReply.properties_mentioned,
      original_draft: existingDraft?.ai_context?.original_draft || originalDraft,
      latest_ai_draft: originalDraft,
      communication_learning: {
        applied: learning.rules.length > 0,
        rules: learning.rules,
      },
    },
    ai_confidence: result.draftReply.confidence,
    tone: result.draftReply.tone,
    language: result.draftReply.language,
    status: "draft",
  };

  const draftQuery = existingDraft?.id
    ? supabase.from("email_drafts").update(draftPayload).eq("id", existingDraft.id).select().single()
    : supabase.from("email_drafts").insert(draftPayload).select().single();
  const { data: draft, error: draftError } = await draftQuery;
  if (draftError) throw new Error(`Draft save failed: ${draftError.message}`);

  await supabase.from("nexus_communication_learning_observations").insert({
    brand_id: email.brand_id,
    email_message_id: emailId,
    draft_id: draft.id,
    event_type: "draft_created",
    ai_confidence: result.draftReply.confidence,
    original_subject: originalDraft.subject,
    original_body: originalDraft.body_text,
    final_subject: originalDraft.subject,
    final_body: originalDraft.body_text,
    edit_ratio: 0,
    metadata: {
      tone: originalDraft.tone,
      language: originalDraft.language,
      intent: result.analysis.intent,
      urgency: result.analysis.urgency,
      learning_rules_applied: learning.rules,
    },
  }).then(() => {}).then(undefined, () => {});

  return { emailId, brandId: email.brand_id, analysis: result.analysis, context_match: result.contextMatch, draft, learningRulesApplied: learning.rules.length };
}
