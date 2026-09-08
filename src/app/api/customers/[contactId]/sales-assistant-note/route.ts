import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAccessContext } from "@/lib/api-admin";
import { hasPermission } from "@/lib/access-control";
import { getContactsSupabase } from "@/app/api/contacts/supabase-client";
import { appendCustomerInteraction } from "@/lib/customer-updates";
import {
  analyzeSalesAssistantNote,
  SalesAssistantNoteInputSchema,
  shouldCreateFollowupCalendarEvent,
} from "@/lib/customers/sales-assistant-note";
import { createGoogleFollowupEvent } from "@/lib/calendar/google-followup";
import { buildBuyerProfileEvidencePreview } from "@/lib/nexus/buyer-profile-evidence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ContactIdSchema = z.string().uuid();
const BodySchema = z.object({ note: z.string().trim().min(3).max(8000) }).strict();

export async function POST(request: NextRequest, { params }: { params: { contactId: string } }) {
  const context = await getRequestAccessContext(request);
  if (!context) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  if (context.role !== "OWNER" && !hasPermission(context.role, "customers.write")) {
    return NextResponse.json({ ok: false, error: "Access permission required" }, { status: 403 });
  }

  const contactId = ContactIdSchema.safeParse(params.contactId);
  if (!contactId.success) return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, error: "Invalid note" }, { status: 400 });

  const supabase = getContactsSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "Contacts database is not configured" }, { status: 500 });
  const { data: contact, error } = await supabase
    .from("contacts")
    .select("id,name,email,phone,notes,interactions,next_followup,pipeline_value,property_interest")
    .eq("id", contactId.data)
    .single();
  if (error || !contact) return NextResponse.json({ ok: false, error: error?.message || "Customer not found" }, { status: 404 });

  const now = new Date().toISOString();
  let analysis;
  try {
    analysis = await analyzeSalesAssistantNote(SalesAssistantNoteInputSchema.parse({
      note: body.data.note,
      nowIso: now,
      timezone: "Europe/Madrid",
      customerName: contact.name || null,
    }));
  } catch (aiError) {
    return NextResponse.json({ ok: false, error: aiError instanceof Error ? aiError.message : "AI analysis failed" }, { status: 502 });
  }

  const followupAt = analysis.nextFollowup && analysis.followupConfidence >= 0.9 ? analysis.nextFollowup : null;
  const buyerProfilePreview = buildBuyerProfileEvidencePreview({
    email: contact.email,
    phone: contact.phone,
    pipeline_value: contact.pipeline_value,
    property_interest: contact.property_interest,
    next_followup: followupAt || contact.next_followup,
    notes: body.data.note,
    interactions: [],
  });
  const buyerProfileEvidence = {
    candidates: buyerProfilePreview.candidates,
    conflicts: buyerProfilePreview.conflicts,
    reviewRecommended: buyerProfilePreview.candidates.length > 0 && buyerProfilePreview.conflicts.length === 0,
    projectedCompleteness: buyerProfilePreview.projectedCompleteness,
    href: "/nexus-os/profile-activation-priority",
    persisted: false as const,
  };

  const followupBrief = [analysis.nextAction, analysis.propertyReference ? `Bolig/ref: ${analysis.propertyReference}` : null]
    .filter(Boolean)
    .join(" · ") || analysis.title || analysis.polishedNote.slice(0, 240);
  const interactionId = crypto.randomUUID();
  const interaction = {
    id: interactionId,
    type: "customer_note",
    date: now,
    direction: "internal",
    content: [
      analysis.title ? `Overskrift: ${analysis.title}` : null,
      analysis.polishedNote,
      analysis.nextAction ? `Neste handling: ${analysis.nextAction}` : null,
      followupAt ? `Neste oppfølging: ${followupAt}` : null,
    ].filter(Boolean).join("\n"),
    metadata: {
      source: "crm-sales-assistant",
      update_type: analysis.updateType,
      outcome: analysis.outcome,
      original_note: body.data.note,
      polished_note: analysis.polishedNote,
      next_action: analysis.nextAction,
      followup_brief: followupBrief,
      next_followup: followupAt,
      followup_confidence: analysis.followupConfidence,
      property_reference: analysis.propertyReference,
      explicit_facts: analysis.explicitFacts,
      buyer_profile_evidence_candidates: buyerProfileEvidence.candidates,
      buyer_profile_evidence_conflicts: buyerProfileEvidence.conflicts,
      buyer_profile_evidence_review_recommended: buyerProfileEvidence.reviewRecommended,
      ai_structured: true,
      actor_email: context.email.toLowerCase(),
      no_customer_contact: true,
    },
  };

  const updates: Record<string, unknown> = {
    interactions: appendCustomerInteraction(contact.interactions, interaction),
    updated_at: now,
  };
  if (followupAt) updates.next_followup = followupAt;

  const saved = await supabase.from("contacts").update(updates).eq("id", contactId.data).select("id,next_followup").single();
  if (saved.error) return NextResponse.json({ ok: false, error: saved.error.message }, { status: 500 });

  let calendar = { created: false as boolean, configured: false as boolean, eventId: null as string | null, href: null as string | null, error: null as string | null };
  if (followupAt && shouldCreateFollowupCalendarEvent(analysis)) {
    calendar = await createGoogleFollowupEvent({
      title: analysis.calendarTitle || `Følg opp ${contact.name || contact.email || "kunde"}`,
      startIso: followupAt,
      durationMinutes: analysis.calendarDurationMinutes || 30,
      description: [followupBrief, analysis.polishedNote, `RealtyFlow CRM customer: ${contact.name || contact.email || contact.id}`].filter(Boolean).join("\n\n"),
    });
  }

  return NextResponse.json({
    ok: true,
    analysis,
    followupBrief,
    followupApplied: Boolean(followupAt),
    buyerProfileEvidence,
    contactId: contact.id,
    interactionId,
    calendar,
    safety: {
      originalNotePreserved: true,
      customerContactSent: false,
      pipelineChanged: false,
      hardBuyerProfileFactsChanged: false,
      buyerProfileEvidencePersisted: false,
      buyerProfileEvidenceReviewFirst: true,
    },
  });
}
