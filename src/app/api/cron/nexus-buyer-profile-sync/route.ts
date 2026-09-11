export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { classifyInboundReply } from "@/lib/inbound-reply-intelligence";
import { applyInboundCrmActions } from "@/services/email/apply-inbound-crm-actions";
import { ensureInboundBuyerProfile } from "@/services/email/inbound-buyer-profile-autopilot";
import { autoReviseBuyerProfileFromInboundEvidence } from "@/services/email/inbound-buyer-profile-revision";
import { extractLatestReplyText } from "@/services/email/latest-reply-text";

export const maxDuration = 300;
const PATH = "/api/cron/nexus-buyer-profile-sync";
const PROFILE_INTENTS = new Set(["active_interest", "property_interest", "viewing_request", "update_preferences"]);
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

async function ensureReviewWorkItem(
  supabase: ReturnType<typeof getSupabase> extends infer T ? NonNullable<T> : never,
  input: {
    sourceWorkItemId: string;
    brandId: string;
    contactId: string;
    emailMessageId: string;
    status: "review_required" | "revision_required";
    reason: string;
    analysis: unknown;
    verifiedCriteriaCount: number;
  },
) {
  const sourceId = `buyer-profile-email:${input.emailMessageId}:${input.status}`;
  const existing = await supabase
    .from("work_items")
    .select("id")
    .eq("source_type", "ai_agent")
    .eq("source_id", sourceId)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return String(existing.data.id);

  const analysisRecord = record(input.analysis);
  const inserted = await supabase
    .from("work_items")
    .insert({
      title: input.status === "revision_required"
        ? "Review kundeendring i Buyer Profile"
        : "Review Buyer Profile fra kundesvar",
      description: input.status === "revision_required"
        ? "Kunden har oppgitt nye eller endrede boligpreferanser. Nexus har analysert svaret, men lar eksisterende godkjent Buyer Profile stå urørt til endringen er kontrollert."
        : "Nexus fant ikke nok eksplisitt, sikkert kundegrunnlag til å godkjenne en Buyer Profile automatisk.",
      status: "TO_DO",
      priority: input.status === "revision_required" ? "HIGH" : "MEDIUM",
      brand_id: input.brandId,
      source_type: "ai_agent",
      source_id: sourceId,
      assigned_agent: "nexus_buyer_intelligence",
      next_action: input.status === "revision_required"
        ? "Kontroller de eksplisitte nye kriteriene og oppdater Buyer Profile før ny boligmatching."
        : "Kontroller kundegrunnlaget og godkjenn bare dokumenterte kriterier før boligmatching.",
      ai_score: input.status === "revision_required" ? 90 : 72,
      metadata: {
        kind: "buyer_profile_email_review",
        domain: "real_estate",
        contact_id: input.contactId,
        email_message_id: input.emailMessageId,
        source_work_item_id: input.sourceWorkItemId,
        reason: input.reason,
        verified_criteria_count: input.verifiedCriteriaCount,
        analysis_summary: typeof analysisRecord.summary === "string" ? analysisRecord.summary : null,
        purchase_readiness: record(analysisRecord.purchaseReadiness),
        budget: record(analysisRecord.budget),
        locations: record(analysisRecord.locations),
        hard_requirements: Array.isArray(analysisRecord.hardRequirements) ? analysisRecord.hardRequirements : [],
        preferences: Array.isArray(analysisRecord.preferences) ? analysisRecord.preferences : [],
        exclusions: Array.isArray(analysisRecord.exclusions) ? analysisRecord.exclusions : [],
        missing_information: Array.isArray(analysisRecord.missingInformation) ? analysisRecord.missingInformation : [],
        performed_by: "Nexus Buyer Profile Autopilot",
      },
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) throw inserted.error || new Error("Could not create Buyer Profile review work item");
  return String(inserted.data.id);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;
  const safeMode = await evaluateCronSafeMode(PATH);
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: rows, error } = await supabase
    .from("work_items")
    .select("id,brand_id,status,source_type,source_id,next_action,metadata,updated_at")
    .eq("source_type", "crm")
    .in("status", OPEN_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let considered = 0;
  let created = 0;
  let linked = 0;
  let revised = 0;
  let reviewRequired = 0;
  let revisionRequired = 0;
  let reclassified = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows || []) {
    const metadata = record(row.metadata);
    const storedIntent = String(metadata.classification || "");
    if (!PROFILE_INTENTS.has(storedIntent)) continue;
    if (metadata.buyer_profile_sync_at) continue;

    const contactId = String(metadata.contact_id || "");
    const emailMessageId = String(metadata.email_message_id || "");
    const brandId = String(row.brand_id || "");
    if (!contactId || !emailMessageId || !brandId) {
      skipped += 1;
      continue;
    }

    considered += 1;
    try {
      const email = await supabase
        .from("email_messages")
        .select("id,from_address,subject,body_text,body_html,ai_summary,ai_urgency,ai_suggested_action")
        .eq("id", emailMessageId)
        .maybeSingle();
      if (email.error) throw email.error;
      if (!email.data) {
        skipped += 1;
        continue;
      }

      const rawBody = String(email.data.body_text || email.data.body_html || "");
      const latestReply = extractLatestReplyText(rawBody) || rawBody;
      const currentClassification = classifyInboundReply({
        subject: String(email.data.subject || ""),
        body: latestReply,
      });
      let intent = currentClassification.intent;

      if (intent !== storedIntent) {
        reclassified += 1;
        const corrected = await applyInboundCrmActions(supabase, {
          emailMessageId,
          brandId,
          fromAddress: String(email.data.from_address || ""),
          subject: email.data.subject,
          body: latestReply,
          summary: email.data.ai_summary,
          urgency: email.data.ai_urgency,
          suggestedAction: email.data.ai_suggested_action,
        });
        intent = corrected.classification;
        await supabase.from("email_messages").update({
          crm_reply_classification: corrected.classification,
          crm_contact_id: corrected.contactId,
        }).eq("id", emailMessageId);

        if (!PROFILE_INTENTS.has(intent)) {
          const now = new Date().toISOString();
          await supabase.from("work_items").update({
            metadata: {
              ...metadata,
              classification: intent,
              reclassified_from: storedIntent,
              reclassified_at: now,
              reclassified_by: "Nexus Buyer Profile Autopilot",
              buyer_profile_sync_at: now,
              buyer_profile_sync_by: "Nexus Buyer Profile Autopilot",
              buyer_profile_sync_status: "reclassified_non_profile",
            },
            next_action: "Nexus har reklassifisert kundesvaret. Buyer Profile og boligmatching kjøres ikke på dette svaret.",
            updated_at: now,
          }).eq("id", row.id);
          skipped += 1;
          continue;
        }
      }

      const result = await ensureInboundBuyerProfile({
        brandId,
        contactId,
        emailMessageId,
        intent,
        subject: email.data.subject,
        body: latestReply,
      });
      const now = new Date().toISOString();
      const nextMetadata: Record<string, unknown> = {
        ...metadata,
        classification: intent,
        ...(intent !== storedIntent ? { reclassified_from: storedIntent, reclassified_at: now } : {}),
        buyer_profile_sync_at: now,
        buyer_profile_sync_by: "Nexus Buyer Profile Autopilot",
        buyer_profile_sync_status: result.status,
        buyer_profile_verified_criteria_count: result.verifiedCriteriaCount,
      };
      let nextAction = row.next_action;

      if (result.status === "created" || result.status === "linked_existing") {
        nextMetadata.buyer_profile_id = result.buyerProfileId;
        nextMetadata.buyer_profile_status = result.buyerProfileStatus;
        nextMetadata.buyer_profile_auto_created = result.status === "created";
        nextAction = result.status === "created"
          ? "Nexus opprettet Buyer Profile fra eksplisitte kundeopplysninger. Automatisk boligmatching kjører videre; kontroller kandidatene før utsending."
          : "Nexus koblet kundesvaret til eksisterende godkjent Buyer Profile. Automatisk boligmatching kjører videre.";
        if (result.status === "created") created += 1;
        else linked += 1;
      } else if (result.status === "revision_required") {
        const revision = await autoReviseBuyerProfileFromInboundEvidence({
          brandId,
          contactId,
          buyerProfileId: result.buyerProfileId,
          emailMessageId,
          rawText: latestReply,
          analysis: result.analysis,
        });

        if (revision.status === "revised") {
          nextMetadata.buyer_profile_id = revision.buyerProfileId;
          nextMetadata.buyer_profile_status = revision.buyerProfileStatus;
          nextMetadata.buyer_profile_sync_status = "revised";
          nextMetadata.buyer_profile_auto_revised = true;
          nextMetadata.buyer_profile_revision_version = revision.version;
          nextMetadata.buyer_profile_revision_changed_keys = revision.changedKeys;
          nextMetadata.buyer_profile_revision_required = false;
          nextMetadata.buyer_profile_review_required = false;
          nextAction = `Nexus oppdaterte Buyer Profile v${revision.version} fra eksplisitte kundeendringer (${revision.changedKeys.join(", ")}). Automatisk boligmatching kjører videre; kontroller kandidatene før utsending.`;
          revised += 1;
        } else {
          const reviewId = await ensureReviewWorkItem(supabase, {
            sourceWorkItemId: String(row.id),
            brandId,
            contactId,
            emailMessageId,
            status: "revision_required",
            reason: revision.reason,
            analysis: result.analysis,
            verifiedCriteriaCount: result.verifiedCriteriaCount,
          });
          nextMetadata.buyer_profile_review_work_item_id = reviewId;
          nextMetadata.buyer_profile_review_required = true;
          nextMetadata.buyer_profile_id = result.buyerProfileId;
          nextMetadata.buyer_profile_status = "REVISION_REQUIRED";
          nextMetadata.buyer_profile_revision_required = true;
          nextMetadata.buyer_profile_revision_reason = revision.reason;
          nextMetadata.buyer_profile_revision_changed_keys = revision.changedKeys;
          nextAction = "Kunden har endret preferanser, men én eller flere endringer er ikke sikre nok for automatisk revisjon. Review endringen før ny matching eller utsending.";
          revisionRequired += 1;
        }
      } else if (result.status === "review_required") {
        const reviewId = await ensureReviewWorkItem(supabase, {
          sourceWorkItemId: String(row.id),
          brandId,
          contactId,
          emailMessageId,
          status: "review_required",
          reason: result.reason,
          analysis: result.analysis,
          verifiedCriteriaCount: result.verifiedCriteriaCount,
        });
        nextMetadata.buyer_profile_review_work_item_id = reviewId;
        nextMetadata.buyer_profile_review_required = true;
        nextAction = "Review eksplisitte kundekriterier før Buyer Profile aktiveres og matching starter.";
        reviewRequired += 1;
      } else {
        skipped += 1;
      }

      const update = await supabase
        .from("work_items")
        .update({ metadata: nextMetadata, next_action: nextAction, updated_at: now })
        .eq("id", row.id);
      if (update.error) throw update.error;
    } catch (workerError) {
      failed += 1;
      console.warn("[nexus-buyer-profile-sync] work item failed", {
        workItemId: row.id,
        error: workerError instanceof Error ? workerError.message : String(workerError),
      });
    }
  }

  await supabase.from("automation_logs").insert({
    action: "nexus_buyer_profile_sync",
    agent_name: "nexus_buyer_profile_autopilot",
    status: failed ? (created || linked || revised || reviewRequired || revisionRequired || reclassified ? "partial" : "failed") : "success",
    details: {
      considered,
      created,
      linked_existing: linked,
      revised,
      review_required: reviewRequired,
      revision_required: revisionRequired,
      reclassified,
      skipped,
      failed,
      runtime_control: `cron:${PATH}`,
    },
  }).then(() => {}).then(undefined, () => {});

  return NextResponse.json({
    success: true,
    considered,
    created,
    linked,
    revised,
    reviewRequired,
    revisionRequired,
    reclassified,
    skipped,
    failed,
  });
}
