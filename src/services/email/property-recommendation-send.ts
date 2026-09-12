import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runNexusSendPreflight } from "@/services/email/nexus-send-preflight";
import { buildPropertyRecommendationTemplate } from "@/services/email/property-recommendation-template";
import { sendBrandEmail } from "@/services/email/send-brand-email";

export type PropertyRecommendationSendResult =
  | { sent: true; duplicate: boolean; messageId: string | null; receiptId: string; propertyCount: number }
  | { sent: false; duplicate: boolean; blocked: boolean; reason: string; blockers?: string[]; receiptId?: string | null };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) { return String(value || "").trim(); }

function payloadHash(value: unknown) {
  return `sha256:v1:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

async function existingReceipt(supabase: SupabaseClient, messageDraftId: string) {
  const result = await supabase
    .from("nexus_property_recommendation_send_receipts")
    .select("id,status,provider_message_id,last_error,payload_hash")
    .eq("message_draft_id", messageDraftId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function sendApprovedPropertyRecommendation(input: {
  supabase: SupabaseClient;
  workItemId: string;
  actor: string;
}): Promise<PropertyRecommendationSendResult> {
  const { supabase } = input;
  const work = await supabase
    .from("work_items")
    .select("id,brand_id,status,metadata")
    .eq("id", input.workItemId)
    .eq("source_type", "crm")
    .maybeSingle();
  if (work.error) throw new Error(work.error.message);
  if (!work.data) return { sent: false, duplicate: false, blocked: true, reason: "Property recommendation work item not found." };

  const metadata = record(work.data.metadata);
  const brandId = text(work.data.brand_id);
  const buyerProfileId = text(metadata.buyer_profile_id);
  const shortlistId = text(metadata.shortlist_id);
  const presentationId = text(metadata.presentation_id);
  const messageDraftId = text(metadata.presentation_message_draft_id);
  const humanApproved = Boolean(metadata.presentation_human_approved_at) && Boolean(metadata.presentation_human_approved_by);
  if (!brandId || !buyerProfileId || !shortlistId || !presentationId || !messageDraftId || !humanApproved) {
    return { sent: false, duplicate: false, blocked: true, reason: "Property recommendation is missing final approved send context." };
  }

  const priorReceipt = await existingReceipt(supabase, messageDraftId);
  if (priorReceipt?.status === "sent") {
    return { sent: true, duplicate: true, messageId: priorReceipt.provider_message_id || null, receiptId: priorReceipt.id, propertyCount: Number(metadata.presentation_property_count || 0) };
  }
  if (priorReceipt && ["sending", "ambiguous"].includes(String(priorReceipt.status))) {
    return { sent: false, duplicate: true, blocked: true, reason: "A provider send is already in progress or has an ambiguous outcome. Automatic retry is blocked.", receiptId: priorReceipt.id };
  }

  const assessment = await runNexusSendPreflight({
    supabase,
    brandId,
    buyerProfileId,
    shortlistId,
    presentationId,
    messageDraftId,
  });
  if (!assessment.ready) {
    return { sent: false, duplicate: false, blocked: true, reason: "Fresh send-preflight is blocked.", blockers: assessment.blockers };
  }

  const [presentationResult, profileResult, draftResult] = await Promise.all([
    supabase.from("lead_customer_presentations")
      .select("id,presentation_json,status")
      .eq("id", presentationId).eq("brand", brandId).maybeSingle(),
    supabase.from("buyer_profiles")
      .select("id,contact_id,status")
      .eq("id", buyerProfileId).eq("brand", brandId).maybeSingle(),
    supabase.from("lead_customer_message_drafts")
      .select("id,status,sent_at,cancelled_at")
      .eq("id", messageDraftId).eq("brand", brandId).maybeSingle(),
  ]);
  const firstError = presentationResult.error || profileResult.error || draftResult.error;
  if (firstError) throw new Error(firstError.message);
  if (!presentationResult.data || !profileResult.data || !draftResult.data || !profileResult.data.contact_id) {
    return { sent: false, duplicate: false, blocked: true, reason: "Approved recommendation dependencies are missing." };
  }

  const contactResult = await supabase.from("contacts")
    .select("id,name,email,brand,brand_id,do_not_contact,email_suppressed")
    .eq("id", profileResult.data.contact_id).maybeSingle();
  if (contactResult.error) throw new Error(contactResult.error.message);
  const contact = contactResult.data;
  const recipient = text(contact?.email).toLowerCase();
  if (!contact?.id || !recipient) return { sent: false, duplicate: false, blocked: true, reason: "Customer email is missing." };

  const template = buildPropertyRecommendationTemplate({
    brandId,
    customerName: contact.name,
    presentationJson: presentationResult.data.presentation_json,
  });
  if (template.propertyCount < 1) {
    return { sent: false, duplicate: false, blocked: true, reason: "No customer-safe property with a verified public URL is available." };
  }

  const hash = payloadHash({ brandId, recipient, subject: template.subject, bodyText: template.bodyText, bodyHtml: template.bodyHtml, presentationId, messageDraftId });
  let receiptId: string | null = null;

  if (priorReceipt?.status === "failed") {
    const retryClaim = await supabase.from("nexus_property_recommendation_send_receipts")
      .update({ status: "sending", last_error: null, failed_at: null, claimed_at: new Date().toISOString(), updated_at: new Date().toISOString(), payload_hash: hash })
      .eq("id", priorReceipt.id).eq("status", "failed")
      .select("id").maybeSingle();
    if (retryClaim.error) throw new Error(retryClaim.error.message);
    if (!retryClaim.data) return { sent: false, duplicate: true, blocked: true, reason: "Recommendation send could not obtain a retry claim.", receiptId: priorReceipt.id };
    receiptId = retryClaim.data.id;
  } else {
    const claim = await supabase.from("nexus_property_recommendation_send_receipts").insert({
      brand: brandId,
      message_draft_id: messageDraftId,
      presentation_id: presentationId,
      buyer_profile_id: buyerProfileId,
      shortlist_id: shortlistId,
      contact_id: contact.id,
      recipient,
      payload_hash: hash,
      status: "sending",
    }).select("id").single();
    if (claim.error) {
      if (String(claim.error.code || "") === "23505") {
        const raced = await existingReceipt(supabase, messageDraftId);
        if (raced?.status === "sent") return { sent: true, duplicate: true, messageId: raced.provider_message_id || null, receiptId: raced.id, propertyCount: template.propertyCount };
        return { sent: false, duplicate: true, blocked: true, reason: "Another recommendation send already owns this draft.", receiptId: raced?.id || null };
      }
      throw new Error(claim.error.message);
    }
    receiptId = claim.data.id;
  }

  try {
    const send = await sendBrandEmail(supabase, {
      brandId,
      to: [recipient],
      subject: template.subject,
      bodyText: template.bodyText,
      bodyHtml: template.bodyHtml,
    });

    if (!send.success) {
      await supabase.from("nexus_property_recommendation_send_receipts").update({
        status: "failed",
        last_error: text(send.error).slice(0, 2000) || "Provider send failed before acceptance.",
        failed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", receiptId);
      return { sent: false, duplicate: false, blocked: Boolean(send.skipped), reason: send.error || "Provider send failed.", receiptId };
    }

    const sentAt = new Date().toISOString();
    const receiptUpdate = await supabase.from("nexus_property_recommendation_send_receipts").update({
      status: "sent",
      provider_message_id: send.messageId || null,
      sent_at: sentAt,
      last_error: null,
      updated_at: sentAt,
    }).eq("id", receiptId).eq("status", "sending");
    if (receiptUpdate.error) {
      // Provider may already have accepted the email. Never auto-retry this draft.
      await supabase.from("nexus_property_recommendation_send_receipts").update({
        status: "ambiguous",
        provider_message_id: send.messageId || null,
        last_error: `Provider accepted send, but durable receipt finalization failed: ${receiptUpdate.error.message}`.slice(0, 2000),
        updated_at: sentAt,
      }).eq("id", receiptId).then(() => {});
      return { sent: false, duplicate: false, blocked: true, reason: "Provider accepted the email but durable finalization failed. Automatic retry is blocked.", receiptId };
    }

    const draftUpdate = await supabase.from("lead_customer_message_drafts").update({ status: "sent", sent_at: sentAt, updated_at: sentAt })
      .eq("id", messageDraftId).eq("brand", brandId).eq("status", "approved").is("sent_at", null);
    if (draftUpdate.error) {
      return { sent: true, duplicate: false, messageId: send.messageId || null, receiptId, propertyCount: template.propertyCount };
    }

    const nextMetadata = {
      ...metadata,
      property_recommendation_sent: true,
      property_recommendation_sent_at: sentAt,
      property_recommendation_sent_by: input.actor,
      property_recommendation_receipt_id: receiptId,
      property_recommendation_provider_message_id: send.messageId || null,
      property_recommendation_property_count: template.propertyCount,
      presentation_customer_send_allowed: false,
      send_preflight_ready: false,
      send_preflight_revalidate_at_send: true,
    };
    await supabase.from("work_items").update({
      metadata: nextMetadata,
      status: "DONE",
      next_action: "Boligforslag er sendt til kunden. Følg med på svar og interesse per bolig.",
      updated_at: sentAt,
    }).eq("id", input.workItemId);

    return { sent: true, duplicate: false, messageId: send.messageId || null, receiptId, propertyCount: template.propertyCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("nexus_property_recommendation_send_receipts").update({
      status: "ambiguous",
      last_error: message.slice(0, 2000),
      updated_at: new Date().toISOString(),
    }).eq("id", receiptId).then(() => {});
    return { sent: false, duplicate: false, blocked: true, reason: "Send outcome is ambiguous. Automatic retry is blocked until reviewed.", receiptId };
  }
}
