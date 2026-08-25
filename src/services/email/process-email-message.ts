import type { SupabaseClient } from "@supabase/supabase-js";
import { EmailAgent } from "@/services/agents/email-agent";
import { BRANDS } from "@/lib/constants";

export async function processEmailMessage(supabase: SupabaseClient, emailId: string) {
  const { data: email, error: emailError } = await supabase
    .from("email_messages")
    .select("*")
    .eq("id", emailId)
    .single();
  if (emailError || !email) throw new Error("Email not found");

  const brand = BRANDS.find((b) => b.id === email.brand_id);
  const { data: emailConfig } = await supabase
    .from("brand_email_configs")
    .select("signature, display_name, email_address")
    .eq("brand_id", email.brand_id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const [{ data: leads }, { data: customers }, { data: properties }] = await Promise.all([
    supabase.from("leads").select("id, first_name, last_name, email, phone, status, budget, notes").limit(100),
    supabase.from("customers").select("id, name, email, phone, status, customer_type, notes").limit(100),
    supabase.from("properties").select("id, ref, price, property_type, location, bedrooms, bathrooms, built_area, plot_size, pool, title_no, title_en, title_es, primary_image, gallery").limit(200),
  ]);

  const brandContext = brand
    ? `Brand: ${brand.name}\nType: ${brand.type}\nTone: ${brand.tone || "professional"}\nMålgruppe: ${brand.target_audience || ""}\nSpesialiteter: ${brand.specialties?.join(", ") || ""}\nNettside: ${brand.website || ""}`
    : "";

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
    metadata: { tone: originalDraft.tone, language: originalDraft.language, intent: result.analysis.intent, urgency: result.analysis.urgency },
  }).then(() => {}).then(undefined, () => {});

  return { emailId, brandId: email.brand_id, analysis: result.analysis, context_match: result.contextMatch, draft };
}
