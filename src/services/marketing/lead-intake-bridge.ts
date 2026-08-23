/**
 * Phase 7.1 — broen mellom Marketing OS og Revenue OS. En lead-form-innsending:
 *  1) fanges som attribution-touchpoints (form_submit + lead_created) så leadet
 *     kobles til innholdet som startet reisen,
 *  2) rutes inn i eksisterende Agentic Lead Intake (buyer profile → find_properties
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
  intake: unknown;
}

export async function submitLeadForm(
  supabase: MarketingSupabaseLike & SupabaseLike,
  submission: LeadFormSubmission,
  role: AccessRole,
): Promise<SubmitLeadFormResult> {
  const inquiry = leadFormToInquiry(submission);
  const occurredAt = inquiry.receivedAt;
  const contactId = submission.contact.email ?? submission.contact.phone ?? submission.visitorId ?? inquiry.externalId;

  // 1) Attribution: form_submit bærer content/campaign; lead_created bærer kontakt.
  let touchpointsRecorded = 0;
  try {
    await recordTouchpoint(supabase, {
      touchType: "form_submit", occurredAt, contentId: submission.contentId, campaignId: submission.campaignId,
      channel: submission.channel ?? null, visitorId: submission.visitorId ?? null, contactId,
      metadata: { publicationId: submission.publicationId ?? null, formId: submission.formId },
    });
    await recordTouchpoint(supabase, {
      touchType: "lead_created", occurredAt, contentId: submission.contentId, campaignId: submission.campaignId,
      channel: submission.channel ?? null, visitorId: submission.visitorId ?? null, contactId,
      metadata: { source: "marketing_lead_form" },
    });
    touchpointsRecorded = 2;
  } catch {
    /* touchpoint-feil skal ikke blokkere selve lead-intaket */
  }

  // 2) Rut inn i Agentic Lead Intake (buyer profile → match → draft → approval).
  const intake = await runLeadIntakeProduction(supabase, inquiry, role);
  return { inquiryExternalId: inquiry.externalId, touchpointsRecorded, intake };
}
