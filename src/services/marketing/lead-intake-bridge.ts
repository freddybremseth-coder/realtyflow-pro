/**
 * Phase 7.1 — broen mellom Marketing OS og Revenue OS. En lead-form-innsending:
 *  1) resolver/oppretter canonical CRM-kontakt når identitet finnes,
 *  2) fanger form_submit direkte, mens canonical lead_created går via revenue_events,
 *  3) rutes inn i eksisterende Agentic Lead Intake (buyer profile → find_properties
 *     → draft → approval) — ingen parallell lead-flyt.
 */

import type { AccessRole } from "@/lib/access-control";
import { leadFormToInquiry, type LeadFormSubmission } from "@/lib/marketing/autonomous";
import { recordTouchpoint } from "@/services/marketing/attribution-adapter";
import { runLeadIntakeProduction } from "@/services/agentic/lead-intake-runtime";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";
import type { SupabaseLike } from "@/services/agentic/adapters";
import { buildRevenueEventDedupeKey, insertRevenueEvent } from "@/lib/revenue/events";

export interface SubmitLeadFormResult {
  inquiryExternalId: string;
  touchpointsRecorded: number;
  canonicalContactId: string | null;
  creativeVariantId: string | null;
  intake: unknown;
}

async function resolveCanonicalContactId(
  supabase: MarketingSupabaseLike & SupabaseLike,
  submission: LeadFormSubmission,
  occurredAt: string,
): Promise<{ contactId: string | null; created: boolean }> {
  const email = submission.contact.email?.trim().toLowerCase() || null;
  const phone = submission.contact.phone?.trim() || null;

  let existing: any = null;
  if (email) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existing = data;
  }
  if (!existing && phone) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("phone", phone)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existing = data;
  }
  if (existing?.id) return { contactId: String(existing.id), created: false };
  if (!email && !phone) return { contactId: null, created: false };

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      name: submission.contact.name?.trim() || "Marketing lead",
      email,
      phone,
      source: "marketing_lead_form",
      brand: submission.brandId,
      brand_id: submission.brandId,
      pipeline_status: "NEW",
      last_contact: occurredAt,
      created_at: occurredAt,
      updated_at: occurredAt,
    })
    .select("id")
    .single();
  if (error) throw new Error(`MARKETING_CONTACT_RESOLVE_FAILED: ${error.message}`);
  return { contactId: data?.id ? String(data.id) : null, created: Boolean(data?.id) };
}

async function resolveCreativeVariantId(
  supabase: MarketingSupabaseLike & SupabaseLike,
  submission: LeadFormSubmission,
): Promise<string | null> {
  if (!submission.creativeVariantId && !submission.creativeTrackingCode) return null;

  let query = supabase
    .from("ad_creatives")
    .select("id,campaign_id,tracking_code")
    .eq("campaign_id", submission.campaignId);

  if (submission.creativeVariantId) query = query.eq("id", submission.creativeVariantId);
  else query = query.eq("tracking_code", submission.creativeTrackingCode!);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error || !data?.id) return null;
  return String(data.id);
}

export async function submitLeadForm(
  supabase: MarketingSupabaseLike & SupabaseLike,
  submission: LeadFormSubmission,
  role: AccessRole,
): Promise<SubmitLeadFormResult> {
  const inquiry = leadFormToInquiry(submission);
  const occurredAt = inquiry.receivedAt;

  let canonicalContactId: string | null = null;
  let contactCreated = false;
  try {
    const resolved = await resolveCanonicalContactId(supabase, submission, occurredAt);
    canonicalContactId = resolved.contactId;
    contactCreated = resolved.created;
  } catch {
    // CRM-identitetsfeil skal ikke blokkere selve lead-intaket. visitorId kan
    // fortsatt bevare pre-CRM-reisen, men vi later aldri som e-post er contact UUID.
  }

  let creativeVariantId: string | null = null;
  try {
    creativeVariantId = await resolveCreativeVariantId(supabase, submission);
  } catch {
    // Creative attribution is optional evidence. An invalid or stale tracking code
    // must never block the lead itself or be accepted without campaign verification.
  }

  // Attribution: brand er eksplisitt tenancy boundary; canonical contact UUID
  // brukes når tilgjengelig. Uten canonical identity beholdes visitorId.
  let touchpointsRecorded = 0;
  try {
    const sharedMetadata = {
      identity: canonicalContactId ? "canonical_contact" : "visitor_only",
      creativeTrackingCode: submission.creativeTrackingCode ?? null,
      creativeResolved: Boolean(creativeVariantId),
    };
    await recordTouchpoint(supabase, {
      brandId: submission.brandId,
      touchType: "form_submit", occurredAt, contentId: submission.contentId, publicationId: submission.publicationId ?? null,
      campaignId: submission.campaignId, creativeVariantId, channel: submission.channel ?? null,
      visitorId: submission.visitorId ?? null, contactId: canonicalContactId,
      sessionId: submission.sessionId ?? null,
      metadata: { ...sharedMetadata, formId: submission.formId },
    });
    touchpointsRecorded = 1;
  } catch {
    /* touchpoint-feil skal ikke blokkere selve lead-intaket */
  }

  if (contactCreated && canonicalContactId) {
    const sourceId = inquiry.externalId;
    await insertRevenueEvent(supabase, {
      eventType: "lead_created",
      title: "Lead opprettet fra marketing-skjema",
      contactId: canonicalContactId,
      brandId: submission.brandId,
      sourceSystem: "marketing_lead_form",
      sourceType: "website_form",
      sourceId,
      actorType: "customer",
      occurredAt,
      dedupeKey: buildRevenueEventDedupeKey(["marketing-lead-form", submission.brandId, sourceId]),
      metadata: {
        content_id: submission.contentId ?? null,
        publication_id: submission.publicationId ?? null,
        campaign_id: submission.campaignId,
        creative_variant_id: creativeVariantId,
        visitor_id: submission.visitorId ?? null,
        session_id: submission.sessionId ?? null,
        channel: submission.channel ?? null,
      },
      createdBy: "marketing/lead-intake-bridge",
    });
  }

  const intake = await runLeadIntakeProduction(supabase, inquiry, role);
  return { inquiryExternalId: inquiry.externalId, touchpointsRecorded, canonicalContactId, creativeVariantId, intake };
}
