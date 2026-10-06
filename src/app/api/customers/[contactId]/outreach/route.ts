import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAccessContext } from "@/lib/api-admin";
import { hasPermission } from "@/lib/access-control";
import { getContactsSupabase } from "@/app/api/contacts/supabase-client";
import { appendCustomerInteraction } from "@/lib/customer-updates";
import {
  buildCustomerOutreachTemplates,
  customerOutreachBrand,
  customerOutreachTemplateById,
  normalizeCustomerOutreachBrand,
} from "@/lib/customers/outreach";
import { evaluateManualCustomerOutreach } from "@/lib/customers/outreach-policy";
import { askNexusAI, isNexusAIConfigured } from "@/services/ai/nexus-ai-client";
import { checkCrmEmailSuppression } from "@/services/email/email-suppression";
import { sendBrandEmail } from "@/services/email/send-brand-email";
import { extractLatestReplyText } from "@/services/email/latest-reply-text";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ContactIdSchema = z.string().uuid();
const RequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("GENERATE"),
    mode: z.enum(["AI"]),
    theme: z.string().trim().min(2).max(1000),
    keywords: z.string().trim().max(2000).optional().default(""),
    tone: z.enum(["warm", "professional", "short", "premium"]).optional().default("warm"),
  }),
  z.object({
    action: z.literal("SEND"),
    subject: z.string().trim().min(1).max(240),
    bodyText: z.string().trim().min(1).max(16000),
    confirmReviewed: z.literal(true),
    source: z.enum(["template", "ai", "manual"]).optional().default("manual"),
    templateId: z.enum(["soft_reconnect", "new_opportunity", "market_update", "criteria_refresh", "short_call"]).optional(),
  }),
]);

function cleanJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  return (fenced || value).trim();
}

function firstName(value: unknown) {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

function getEmailTime(row: Record<string, any> | null | undefined) {
  const date = new Date(String(row?.received_at || row?.created_at || ""));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

async function loadContext(contactId: string) {
  const supabase = getContactsSupabase();
  if (!supabase) return { error: "Contacts database is not configured" as const, status: 500 as const };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,brand,brand_id,pipeline_status,nurture_status,do_not_contact,email_suppressed,suppression_reason,waiting_until,waiting_reason,last_reply_classification,last_inbound_reply_at,preferred_location,notes,interactions")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return { error: contactError?.message || "Customer not found", status: 404 as const };
  }

  const brandId = normalizeCustomerOutreachBrand(contact.brand_id || contact.brand);
  const email = String(contact.email || "").trim().toLowerCase();

  const [{ data: senderRows }, inboundMessages, outboundMessages, { data: profiles }] = await Promise.all([
    supabase
      .from("brand_email_configs")
      .select("id,email_address,display_name,is_active")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1),
    email
      ? supabase
          .from("email_messages")
          .select("id,direction,from_address,to_addresses,subject,body_text,body_html,received_at,created_at")
          .eq("direction", "inbound")
          .ilike("from_address", email)
          .order("received_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as any[] }),
    email
      ? supabase
          .from("email_messages")
          .select("id,direction,from_address,to_addresses,subject,body_text,body_html,received_at,created_at")
          .eq("direction", "outbound")
          .contains("to_addresses", [email])
          .order("received_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("buyer_profiles")
      .select("id,status,purchase_readiness,budget_amount,budget_currency,summary,updated_at")
      .eq("contact_id", contactId)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  const messages = [...(inboundMessages.data || []), ...(outboundMessages.data || [])]
    .sort((a: any, b: any) => getEmailTime(b) - getEmailTime(a));
  const lastInbound = messages.find((row: any) => String(row.direction || "").toLowerCase() === "inbound") || null;
  const lastOutbound = messages.find((row: any) => String(row.direction || "").toLowerCase() === "outbound") || null;
  const awaitingReply = getEmailTime(lastOutbound) > 0 && getEmailTime(lastOutbound) > getEmailTime(lastInbound);
  const suppression = email
    ? await checkCrmEmailSuppression(supabase, [email])
    : { blocked: false, blockedEmails: [], manualTakeoverEmails: [], hardBlockedEmails: [] as string[] };

  let eligibility = evaluateManualCustomerOutreach(contact, { awaitingReply });
  if (suppression.error) {
    eligibility = { allowed: false, blockedReason: `CRM suppression kunne ikke verifiseres: ${suppression.error}`, warnings: eligibility.warnings };
  } else if ((suppression.hardBlockedEmails || []).length > 0) {
    eligibility = { allowed: false, blockedReason: "Kunden har en hard e-postsperre (STOPP/unsubscribe/CRM suppression).", warnings: eligibility.warnings };
  }

  const activeProfile = (profiles || []).find((row: any) => String(row.status || "").toLowerCase() === "approved")
    || (profiles || [])[0]
    || null;

  return {
    supabase,
    contact,
    brandId,
    brand: customerOutreachBrand(brandId),
    sender: senderRows?.[0] || null,
    lastInbound,
    lastOutbound,
    activeProfile,
    awaitingReply,
    suppression,
    eligibility,
  };
}

async function authorize(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (!context) return { denied: NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 }), context: null };
  if (context.role !== "OWNER" && !hasPermission(context.role, "customers.write")) {
    return {
      denied: NextResponse.json({ ok: false, error: "Access permission required", requiredPermission: "customers.write" }, { status: 403 }),
      context: null,
    };
  }
  return { denied: null, context };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { contactId: string } },
) {
  const auth = await authorize(request);
  if (auth.denied) return auth.denied;

  const parsedId = ContactIdSchema.safeParse(params.contactId);
  if (!parsedId.success) return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });

  const loaded = await loadContext(parsedId.data);
  if ("error" in loaded) return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });

  const templates = buildCustomerOutreachTemplates({
    contactName: loaded.contact.name,
    brandId: loaded.brandId,
  });

  return NextResponse.json({
    ok: true,
    recipient: { name: loaded.contact.name, email: loaded.contact.email },
    brand: loaded.brand ? { id: loaded.brand.id, name: loaded.brand.name, website: loaded.brand.website } : { id: loaded.brandId },
    sender: loaded.sender ? { email: loaded.sender.email_address, name: loaded.sender.display_name } : null,
    templates,
    eligibility: {
      ...loaded.eligibility,
      allowed: loaded.eligibility.allowed && Boolean(loaded.sender),
      blockedReason: loaded.eligibility.blockedReason || (!loaded.sender ? "Ingen aktiv e-postsender er konfigurert for merkevaren." : null),
    },
    awaitingReply: loaded.awaitingReply,
    manualTakeover: String(loaded.contact.suppression_reason || "") === "manual_owner_takeover",
    lastInboundPreview: loaded.lastInbound
      ? extractLatestReplyText(String(loaded.lastInbound.body_text || loaded.lastInbound.body_html || "")).slice(0, 1200)
      : "",
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { contactId: string } },
) {
  const auth = await authorize(request);
  if (auth.denied || !auth.context) return auth.denied;

  const parsedId = ContactIdSchema.safeParse(params.contactId);
  if (!parsedId.success) return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid outreach request" }, { status: 400 });

  const loaded = await loadContext(parsedId.data);
  if ("error" in loaded) return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });

  if (parsed.data.action === "GENERATE") {
    if (!loaded.eligibility.allowed) {
      return NextResponse.json({ ok: false, error: loaded.eligibility.blockedReason || "Kunden kan ikke kontaktes nå." }, { status: 409 });
    }

    const fallbackSubject = parsed.data.theme.length <= 80
      ? parsed.data.theme
      : "Kort oppfølging om bolig i Spania";
    const name = firstName(loaded.contact.name);
    const website = loaded.brand?.website || "";
    const fallbackBody = [
      name ? `Hei ${name},` : "Hei,",
      "",
      parsed.data.theme,
      parsed.data.keywords ? `\nJeg tenkte spesielt på: ${parsed.data.keywords}.` : "",
      "",
      "Hvis dette fortsatt er relevant for deg, kan jeg gjerne følge opp med noen få konkrete forslag eller en kort oppdatering.",
      "",
      "Vennlig hilsen",
      "Freddy",
      website,
    ].filter(Boolean).join("\n");

    if (!isNexusAIConfigured()) {
      return NextResponse.json({
        ok: true,
        draft: { subject: fallbackSubject, bodyText: fallbackBody },
        provider: "deterministic",
        model: "fallback",
      });
    }

    const lastReply = loaded.lastInbound
      ? extractLatestReplyText(String(loaded.lastInbound.body_text || loaded.lastInbound.body_html || "")).slice(0, 4000)
      : "";

    const systemPrompt = `Du skriver én manuell salgsoppfølgingsmail fra Freddy til en privat boligkunde i Spania.
Målet er å skape ekte interesse uten press.

Regler:
- Skriv på norsk.
- Bruk kundens fornavn hvis det finnes.
- Vær kort, personlig, konkret og naturlig.
- Ikke finn opp boliger, priser, markedstall, tidligere løfter eller kundepreferanser.
- Ikke bruk falsk knapphet, "siste sjanse", manipulasjon eller overdrivelser.
- Hvis Buyer Profile eller siste kundesvar gir trygg evidens, kan du bruke den forsiktig.
- Én tydelig, lavterskel CTA.
- Ikke si at AI har skrevet teksten.
- Avslutt med "Vennlig hilsen" og "Freddy".
- Ta med merkevarens nettsted nederst når det finnes.
- Returner KUN JSON: {"subject":"...","bodyText":"..."}.`;

    try {
      const result = await askNexusAI(JSON.stringify({
        task: "customer_outreach_email",
        requestedTone: parsed.data.tone,
        theme: parsed.data.theme,
        keywords: parsed.data.keywords,
        customer: {
          firstName: name || null,
          preferredLocation: loaded.contact.preferred_location || null,
          pipelineStatus: loaded.contact.pipeline_status || null,
        },
        buyerProfile: loaded.activeProfile
          ? {
              summary: loaded.activeProfile.summary || null,
              readiness: loaded.activeProfile.purchase_readiness || null,
              budgetAmount: loaded.activeProfile.budget_amount || null,
              budgetCurrency: loaded.activeProfile.budget_currency || null,
            }
          : null,
        lastCustomerReply: lastReply || null,
        brand: loaded.brand
          ? { name: loaded.brand.name, tone: loaded.brand.tone, website: loaded.brand.website }
          : null,
      }, null, 2), { systemPrompt, maxTokens: 1400 });

      const ai = JSON.parse(cleanJson(result.text));
      const subject = String(ai?.subject || fallbackSubject).trim().slice(0, 240);
      const bodyText = String(ai?.bodyText || fallbackBody).trim().slice(0, 16000);
      return NextResponse.json({ ok: true, draft: { subject, bodyText }, provider: result.provider, model: result.model });
    } catch (error) {
      console.warn("[Customer Outreach] AI generation failed, using fallback", error);
      return NextResponse.json({
        ok: true,
        draft: { subject: fallbackSubject, bodyText: fallbackBody },
        provider: "deterministic",
        model: "fallback",
      });
    }
  }

  const freshLoaded = await loadContext(parsedId.data);
  if ("error" in freshLoaded) return NextResponse.json({ ok: false, error: freshLoaded.error }, { status: freshLoaded.status });
  if (!freshLoaded.eligibility.allowed) {
    return NextResponse.json({ ok: false, error: freshLoaded.eligibility.blockedReason || "Kunden kan ikke kontaktes nå." }, { status: 409 });
  }
  if (!freshLoaded.sender) {
    return NextResponse.json({ ok: false, error: "Ingen aktiv e-postsender er konfigurert for merkevaren." }, { status: 409 });
  }

  const sendResult = await sendBrandEmail(freshLoaded.supabase, {
    brandId: freshLoaded.brandId,
    to: [String(freshLoaded.contact.email).trim()],
    subject: parsed.data.subject,
    bodyText: parsed.data.bodyText,
    manualAdvisorAction: true,
    crmContactId: freshLoaded.contact.id,
  });

  if (!sendResult.success) {
    return NextResponse.json({ ok: false, error: sendResult.error || "E-posten kunne ikke sendes." }, { status: sendResult.skipped ? 409 : 500 });
  }

  const now = new Date().toISOString();
  const interaction = {
    id: crypto.randomUUID(),
    type: "manual_outreach_email",
    date: now,
    direction: "outbound",
    content: parsed.data.subject,
    metadata: {
      source: "customer-360-outreach",
      update_type: "manual_email_send",
      title: "Manuell e-post sendt fra Customer 360",
      actor_email: auth.context.email.toLowerCase(),
      manual_send: true,
      composition_source: parsed.data.source,
      template_id: parsed.data.templateId || null,
      subject: parsed.data.subject,
      body_preview: parsed.data.bodyText.slice(0, 500),
      message_id: sendResult.messageId || null,
    },
  };

  await freshLoaded.supabase
    .from("contacts")
    .update({
      interactions: appendCustomerInteraction(freshLoaded.contact.interactions, interaction),
      updated_at: now,
    })
    .eq("id", freshLoaded.contact.id);

  return NextResponse.json({
    ok: true,
    sent: true,
    messageId: sendResult.messageId || null,
    recipient: freshLoaded.contact.email,
    sender: freshLoaded.sender.email_address,
  });
}
