/**
 * Phase 7.1 — broen mellom Marketing OS og Revenue OS. En lead-form-innsending:
 *  1) resolver/oppretter canonical CRM-kontakt når identitet finnes,
 *  2) fanges som attribution-touchpoints (form_submit + lead_created),
 *  3) rutes inn i eksisterende Agentic Lead Intake (buyer profile → find_properties
 *     → draft → approval) — ingen parallell lead-flyt.
 */

import type { AccessRole } from "@/lib/access-control";
import { leadFormToInquiry, type LeadFormSubmission } from "@/lib/marketing/autonomous";
import { recordTouchpoint } from "@/services/marketing/attribution-adapter";
import { runLeadIntakeProduction } from "@/services/agentic/lead-intake-runtime";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";
import type { SupabaseLike } from "@/services/agentic/adapters";

export interface SubmitLeadFormResult {
  inquiryExternalId: string;
  touchpointsRecorded: number;
  canonicalContactId: string | null;
  intake: unknown;
}

async function resolveCanonicalContactId(
  supabase: MarketingSupabaseLike & SupabaseLike,
  submission: LeadFormSubmission,
  occurredAt: string,
): Promise<string | null> {
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
  if (existing?.id) return String(existing.id);
  if (!email && !phone) return null;

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
  return data?.id ? String(data.id) : null;
}

export async function submitLeadForm(
  supabase: MarketingSupabaseLike & SupabaseLike,
  submission: LeadFormSubmission,
  role: AccessRole,
): Promise<SubmitLeadFormResult> {
  const inquiry = leadFormToInquiry(submission);
  const occurredAt = inquiry.receivedAt;

  let canonicalContactId: string | null = null;
  try {
    canonicalContactId = await resolveCanonicalContactId(supabase, submission, occurredAt);
  } catch {
    // CRM-identitetsfeil skal ikke blokkere selve lead-intaket. visitorId kan
    // fortsatt bevare pre-CRM-reisen, men vi later aldri som e-post er contact UUID.
  }

  // Attribution: brand er eksplisitt tenancy boundary; canonical contact UUID
  // brukes når tilgjengelig. Uten canonical identity beholdes visitorId.
  let touchpointsRecorded = 0;
  try {
    await recordTouchpoint(supabase, {
      brandId: submission.brandId,
      touchType: "form_submit", occurredAt, contentId: submission.contentId, publicationId: submission.publicationId ?? null,
      campaignId: submission.campaignId, channel: submission.channel ?? null,
      visitorId: submission.visitorId ?? null, contactId: canonicalContactId,
      metadata: { formId: submission.formId, identity: canonicalContactId ? "canonical_contact" : "visitor_only" },
    });
    await recordTouchpoint(supabase, {
      brandId: submission.brandId,
      touchType: "lead_created", occurredAt, contentId: submission.contentId, publicationId: submission.publicationId ?? null,
      campaignId: submission.campaignId, channel: submission.channel ?? null,
      visitorId: submission.visitorId ?? null, contactId: canonicalContactId,
      metadata: { source: "marketing_lead_form", identity: canonicalContactId ? "canonical_contact" : "visitor_only" },
    });
    touchpointsRecorded = 2;
  } catch {
    /* touchpoint-feil skal ikke blokkere selve lead-intaket */
  }

  const intake = await runLeadIntakeProduction(supabase, inquiry, role);
  return { inquiryExternalId: inquiry.externalId, touchpointsRecorded, canonicalContactId, intake };
}
