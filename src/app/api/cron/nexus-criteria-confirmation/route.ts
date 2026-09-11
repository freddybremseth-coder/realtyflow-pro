export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { ensureInboundBuyerProfile } from "@/services/email/inbound-buyer-profile-autopilot";
import { autoReviseBuyerProfileFromInboundEvidence } from "@/services/email/inbound-buyer-profile-revision";
import {
  isAffirmativeCriteriaConfirmation,
  sendBuyerCriteriaConfirmation,
} from "@/services/email/buyer-profile-confirmation";
import { extractLatestReplyText } from "@/services/email/latest-reply-text";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-criteria-confirmation";
const OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function analysisFromReviewMetadata(metadata: Record<string, unknown>) {
  return {
    contact: { name: null, phone: null, email: null, language: null, country: null },
    purchaseReadiness: record(metadata.purchase_readiness),
    budget: record(metadata.budget),
    propertyTypes: Array.isArray(metadata.property_types) ? metadata.property_types : [],
    locations: record(metadata.locations),
    hardRequirements: Array.isArray(metadata.hard_requirements) ? metadata.hard_requirements : [],
    preferences: Array.isArray(metadata.preferences) ? metadata.preferences : [],
    exclusions: Array.isArray(metadata.exclusions) ? metadata.exclusions : [],
    missingInformation: Array.isArray(metadata.missing_information) ? metadata.missing_information : [],
    summary: typeof metadata.analysis_summary === "string" ? metadata.analysis_summary : "",
    suggestedNextAction: "Bekreft kriteriene før videre matching.",
  };
}

async function finishConfirmationReview(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  input: {
    reviewWorkItemId: string;
    metadata: Record<string, unknown>;
    outcome: string;
    responseEmailMessageId: string;
    nextAction: string;
    done: boolean;
    extra?: Record<string, unknown>;
  },
) {
  const now = new Date().toISOString();
  const nextMetadata = {
    ...input.metadata,
    confirmation_pending: false,
    confirmation_response_received_at: now,
    confirmation_response_email_message_id: input.responseEmailMessageId,
    confirmation_outcome: input.outcome,
    ...input.extra,
  };
  const update = await supabase
    .from("work_items")
    .update({
      status: input.done ? "DONE" : "TO_DO",
      metadata: nextMetadata,
      next_action: input.nextAction,
      updated_at: now,
    })
    .eq("id", input.reviewWorkItemId);
  if (update.error) throw update.error;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: reviews, error } = await supabase
    .from("work_items")
    .select("id,brand_id,status,source_type,source_id,next_action,metadata,updated_at")
    .eq("source_type", "ai_agent")
    .eq("assigned_agent", "nexus_buyer_intelligence")
    .in("status", OPEN_STATUSES)
    .eq("metadata->>kind", "buyer_profile_email_review")
    .order("updated_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let considered = 0;
  let confirmationSent = 0;
  let sendSkipped = 0;
  let awaitingReply = 0;
  let confirmedApplied = 0;
  let correctionReplies = 0;
  let confirmedButReview = 0;
  let failed = 0;

  for (const row of reviews || []) {
    considered += 1;
    try {
      let metadata = record(row.metadata);
      const contactId = String(metadata.contact_id || "");
      const sourceEmailMessageId = String(metadata.email_message_id || "");
      const sourceWorkItemId = String(metadata.source_work_item_id || "");
      const brandId = String(row.brand_id || "");
      if (!contactId || !sourceEmailMessageId || !sourceWorkItemId || !brandId) {
        sendSkipped += 1;
        continue;
      }

      if (!metadata.confirmation_requested_at && !metadata.confirmation_send_status) {
        const sent = await sendBuyerCriteriaConfirmation(supabase, {
          brandId,
          contactId,
          reviewWorkItemId: String(row.id),
          sourceEmailMessageId,
          sourceWorkItemId,
          analysis: analysisFromReviewMetadata(metadata),
        });
        if (sent.sent) confirmationSent += 1;
        else sendSkipped += 1;

        const refreshed = await supabase.from("work_items").select("metadata").eq("id", row.id).maybeSingle();
        if (refreshed.error) throw refreshed.error;
        metadata = record(refreshed.data?.metadata);
      }

      if (metadata.confirmation_pending !== true || !metadata.confirmation_requested_at) continue;

      const contact = await supabase
        .from("contacts")
        .select("id,email")
        .eq("id", contactId)
        .maybeSingle();
      if (contact.error) throw contact.error;
      const contactEmail = String(contact.data?.email || "").trim().toLowerCase();
      if (!contactEmail) {
        awaitingReply += 1;
        continue;
      }

      const inbound = await supabase
        .from("email_messages")
        .select("id,subject,body_text,body_html,received_at")
        .eq("direction", "inbound")
        .ilike("from_address", contactEmail)
        .gt("received_at", String(metadata.confirmation_requested_at))
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (inbound.error) throw inbound.error;
      if (!inbound.data) {
        awaitingReply += 1;
        continue;
      }

      const latestReply = extractLatestReplyText(String(inbound.data.body_text || inbound.data.body_html || ""));
      if (!isAffirmativeCriteriaConfirmation(latestReply)) {
        correctionReplies += 1;
        await finishConfirmationReview(supabase, {
          reviewWorkItemId: String(row.id),
          metadata,
          outcome: "correction_or_clarification_received",
          responseEmailMessageId: String(inbound.data.id),
          nextAction: "Kunden svarte med en korrigering eller utdyping. Nexus behandler det nye kundesvaret og bygger kriteriene på nytt.",
          done: true,
        });
        continue;
      }

      const confirmationContext = String(metadata.confirmation_context_text || "").trim();
      if (!confirmationContext) {
        confirmedButReview += 1;
        await finishConfirmationReview(supabase, {
          reviewWorkItemId: String(row.id),
          metadata,
          outcome: "confirmed_missing_context",
          responseEmailMessageId: String(inbound.data.id),
          nextAction: "Kunden har bekreftet, men bekreftelseskonteksten mangler. Kontroller kriteriene manuelt før matching.",
          done: false,
        });
        continue;
      }

      const sourceWork = await supabase
        .from("work_items")
        .select("id,metadata,next_action")
        .eq("id", sourceWorkItemId)
        .maybeSingle();
      if (sourceWork.error) throw sourceWork.error;
      if (!sourceWork.data) {
        confirmedButReview += 1;
        await finishConfirmationReview(supabase, {
          reviewWorkItemId: String(row.id),
          metadata,
          outcome: "confirmed_source_work_missing",
          responseEmailMessageId: String(inbound.data.id),
          nextAction: "Kunden har bekreftet kriteriene, men kildeoppgaven mangler. Kontroller Buyer Profile manuelt.",
          done: false,
        });
        continue;
      }

      const sourceMetadata = record(sourceWork.data.metadata);
      const revisionMode = Boolean(sourceMetadata.buyer_profile_id)
        && (sourceMetadata.buyer_profile_revision_required === true || String(sourceMetadata.buyer_profile_status || "").toUpperCase() === "REVISION_REQUIRED");

      const profileResult = await ensureInboundBuyerProfile({
        brandId,
        contactId,
        emailMessageId: String(inbound.data.id),
        intent: revisionMode ? "update_preferences" : "active_interest",
        subject: inbound.data.subject,
        body: confirmationContext,
      });

      let buyerProfileId: string | null = null;
      let buyerProfileStatus: string | null = null;
      let syncStatus = "confirmed_review_required";
      let revisionVersion: number | null = null;

      if (profileResult.status === "created" || profileResult.status === "linked_existing") {
        buyerProfileId = profileResult.buyerProfileId;
        buyerProfileStatus = profileResult.buyerProfileStatus;
        syncStatus = profileResult.status === "created" ? "confirmed_created" : "confirmed_linked_existing";
      } else if (profileResult.status === "revision_required") {
        const revised = await autoReviseBuyerProfileFromInboundEvidence({
          brandId,
          contactId,
          buyerProfileId: profileResult.buyerProfileId,
          emailMessageId: String(inbound.data.id),
          rawText: confirmationContext,
          analysis: profileResult.analysis,
        });
        if (revised.status === "revised") {
          buyerProfileId = revised.buyerProfileId;
          buyerProfileStatus = revised.buyerProfileStatus;
          revisionVersion = revised.version;
          syncStatus = "confirmed_revised";
        }
      }

      if (!buyerProfileId || buyerProfileStatus !== "APPROVED") {
        confirmedButReview += 1;
        await finishConfirmationReview(supabase, {
          reviewWorkItemId: String(row.id),
          metadata,
          outcome: "confirmed_but_manual_review_required",
          responseEmailMessageId: String(inbound.data.id),
          nextAction: "Kunden har bekreftet kriteriene, men Nexus kunne ikke aktivere Buyer Profile sikkert. Kontroller og godkjenn profilen manuelt.",
          done: false,
        });
        continue;
      }

      const now = new Date().toISOString();
      const nextSourceMetadata = {
        ...sourceMetadata,
        buyer_profile_id: buyerProfileId,
        buyer_profile_status: "APPROVED",
        buyer_profile_sync_status: syncStatus,
        buyer_profile_review_required: false,
        buyer_profile_revision_required: false,
        buyer_profile_confirmation_at: now,
        buyer_profile_confirmation_response_email_id: String(inbound.data.id),
        ...(revisionVersion ? { buyer_profile_revision_version: revisionVersion } : {}),
      };
      const sourceUpdate = await supabase
        .from("work_items")
        .update({
          metadata: nextSourceMetadata,
          next_action: "Kunden har bekreftet søkekriteriene. Buyer Profile er godkjent og automatisk boligmatching kan fortsette.",
          updated_at: now,
        })
        .eq("id", sourceWorkItemId);
      if (sourceUpdate.error) throw sourceUpdate.error;

      await finishConfirmationReview(supabase, {
        reviewWorkItemId: String(row.id),
        metadata,
        outcome: syncStatus,
        responseEmailMessageId: String(inbound.data.id),
        nextAction: "Kunden har bekreftet kriteriene. Buyer Profile er oppdatert og sendt videre til automatisk boligmatching.",
        done: true,
        extra: {
          confirmed_buyer_profile_id: buyerProfileId,
          confirmed_buyer_profile_status: "APPROVED",
          confirmed_revision_version: revisionVersion,
        },
      });
      confirmedApplied += 1;
    } catch (workerError) {
      failed += 1;
      console.warn("[nexus-criteria-confirmation] work item failed", {
        workItemId: row.id,
        error: workerError instanceof Error ? workerError.message : String(workerError),
      });
    }
  }

  await supabase.from("automation_logs").insert({
    action: "nexus_criteria_confirmation",
    agent_name: "nexus_criteria_confirmation_autopilot",
    status: failed ? (confirmationSent || confirmedApplied || correctionReplies ? "partial" : "failed") : "success",
    details: {
      considered,
      confirmation_sent: confirmationSent,
      send_skipped: sendSkipped,
      awaiting_reply: awaitingReply,
      confirmed_applied: confirmedApplied,
      correction_replies: correctionReplies,
      confirmed_but_review: confirmedButReview,
      failed,
      runtime_control: `cron:${PATH}`,
    },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({
    success: true,
    considered,
    confirmationSent,
    sendSkipped,
    awaitingReply,
    confirmedApplied,
    correctionReplies,
    confirmedButReview,
    failed,
  });
}
