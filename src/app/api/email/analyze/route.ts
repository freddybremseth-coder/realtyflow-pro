import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { EmailAgent } from "@/services/agents/email-agent";
import { BRANDS } from "@/lib/constants";

/**
 * POST /api/email/analyze
 * Analyze an email with AI agent, match context, and generate draft reply.
 * Body: { email_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { email_id } = await req.json();

    if (!email_id) {
      return NextResponse.json(
        { error: "email_id is required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get the email message
    const { data: email, error: emailError } = await supabase
      .from("email_messages")
      .select("*")
      .eq("id", email_id)
      .single();

    if (emailError || !email) {
      return NextResponse.json(
        { error: "Email not found" },
        { status: 404 }
      );
    }

    // Get brand info
    const brand = BRANDS.find((b) => b.id === email.brand_id);

    // Get brand email config for signature
    const { data: emailConfig } = await supabase
      .from("brand_email_configs")
      .select("signature, display_name, email_address")
      .eq("brand_id", email.brand_id)
      .eq("is_active", true)
      .single();

    // Fetch context data for matching
    const [
      { data: leads },
      { data: customers },
      { data: properties },
    ] = await Promise.all([
      supabase
        .from("leads")
        .select("id, first_name, last_name, email, phone, status, budget, notes")
        .limit(100),
      supabase
        .from("customers")
        .select("id, name, email, phone, status, customer_type, notes")
        .limit(100),
      supabase
        .from("properties")
        .select("id, ref, price, property_type, location, bedrooms, bathrooms, built_area, title_no, title_en, title_es")
        .limit(200),
    ]);

    // Build brand context for the agent
    const brandContext = brand
      ? `Brand: ${brand.name}\nType: ${brand.type}\nTone: ${brand.tone || "professional"}\nMålgruppe: ${brand.target_audience || ""}\nSpesialiteter: ${brand.specialties?.join(", ") || ""}\nNettside: ${brand.website || ""}`
      : "";

    // Initialize the email agent
    const agent = new EmailAgent(brandContext);

    // Run full email processing pipeline
    const result = await agent.processEmail({
      subject: email.subject || "",
      body: email.body_text || email.body_html || "",
      from_address: email.from_address,
      from_name: email.from_name || undefined,
      brand_info: brand
        ? {
            name: brand.name,
            tone: brand.tone,
            target_audience: brand.target_audience,
            specialties: brand.specialties,
            website: brand.website,
          }
        : undefined,
      leads: (leads || []).map((l) => ({
        id: l.id,
        name: `${l.first_name} ${l.last_name}`,
        email: l.email,
        phone: l.phone,
        status: l.status,
        budget: l.budget,
      })),
      customers: (customers || []).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        status: c.status,
        type: c.customer_type,
      })),
      properties: (properties || []).map((p) => ({
        id: p.id,
        ref: p.ref,
        price: p.price,
        type: p.property_type,
        location: p.location,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        area: p.built_area,
        title: p.title_no || p.title_en || p.title_es,
      })),
      signature: emailConfig?.signature || `Med vennlig hilsen\n${emailConfig?.display_name || brand?.name || ""}`,
    });

    // Update email with AI analysis
    const { error: updateError } = await supabase
      .from("email_messages")
      .update({
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
      })
      .eq("id", email_id);

    if (updateError) {
      console.error("[Email Analyze] Failed to update email:", updateError);
    }

    // Save draft reply
    const { data: draft, error: draftError } = await supabase
      .from("email_drafts")
      .insert({
        email_message_id: email_id,
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
        },
        ai_confidence: result.draftReply.confidence,
        tone: result.draftReply.tone,
        language: result.draftReply.language,
        status: "draft",
      })
      .select()
      .single();

    if (draftError) {
      console.error("[Email Analyze] Failed to save draft:", draftError);
    }

    return NextResponse.json({
      success: true,
      analysis: result.analysis,
      context_match: result.contextMatch,
      draft: draft || {
        subject: result.draftReply.subject,
        body_text: result.draftReply.body_text,
        confidence: result.draftReply.confidence,
      },
    });
  } catch (error) {
    console.error("[Email Analyze]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
