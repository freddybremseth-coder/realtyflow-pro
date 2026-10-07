import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CORPORATE_DECISION_FOLLOWUP_STEPS,
  corporateDecisionStopReason,
  daysBetween,
  firstName,
  type CorporateDecisionNoteState,
} from "@/lib/corporate-decision-note";
import {
  logCorporateDecisionFollowupFailure,
  markCorporateDecisionFollowupSent,
  markCorporateDecisionNoteStopped,
} from "@/services/corporate/decision-note-delivery";
import { sendBrandEmail } from "@/services/email/send-brand-email";

type JsonRecord = Record<string, any>;

function object(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function htmlEscape(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function followupHtml(body: string) {
  const paragraphs = body
    .split(/\n\n+/)
    .map((paragraph) => {
      const escaped = htmlEscape(paragraph).replace(/\n/g, "<br>");
      return `<p style="font-size:15px;line-height:1.65;margin:0 0 16px">${escaped}</p>`;
    })
    .join("");

  return `<!doctype html>
<html lang="no">
<body style="margin:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#17242a">
  <div style="max-width:650px;margin:0 auto;padding:28px 18px">
    <div style="background:#fff;border:1px solid #e0e3df;border-radius:16px;padding:30px">
      <div style="font-size:11px;letter-spacing:1.3px;text-transform:uppercase;color:#8b6a31;font-weight:700;margin-bottom:16px">Zen Eco Homes · Corporate Homes</div>
      ${paragraphs}
    </div>
  </div>
</body>
</html>`;
}

function stateFromEvidence(evidence: unknown): CorporateDecisionNoteState | null {
  const state = object(object(evidence).corporate_decision_note) as CorporateDecisionNoteState;
  if (!state?.request_id || !state?.report) return null;
  return state;
}

function stepAlreadySent(state: CorporateDecisionNoteState, stepId: "day_2" | "day_5" | "day_10") {
  const key = `${stepId}_sent_at` as "day_2_sent_at" | "day_5_sent_at" | "day_10_sent_at";
  return Boolean(state.followup?.[key]);
}

function nextSequenceStep(state: CorporateDecisionNoteState, ageDays: number) {
  if (stepAlreadySent(state, "day_10")) return null;

  if (stepAlreadySent(state, "day_5")) {
    return ageDays >= 10
      ? CORPORATE_DECISION_FOLLOWUP_STEPS.find((step) => step.id === "day_10") || null
      : null;
  }

  if (stepAlreadySent(state, "day_2")) {
    if (ageDays >= 10) {
      return CORPORATE_DECISION_FOLLOWUP_STEPS.find((step) => step.id === "day_10") || null;
    }
    return ageDays >= 5
      ? CORPORATE_DECISION_FOLLOWUP_STEPS.find((step) => step.id === "day_5") || null
      : null;
  }

  if (ageDays >= 10) {
    return CORPORATE_DECISION_FOLLOWUP_STEPS.find((step) => step.id === "day_10") || null;
  }
  if (ageDays >= 5) {
    return CORPORATE_DECISION_FOLLOWUP_STEPS.find((step) => step.id === "day_5") || null;
  }
  if (ageDays >= 2) {
    return CORPORATE_DECISION_FOLLOWUP_STEPS.find((step) => step.id === "day_2") || null;
  }
  return null;
}

function nextDueDate(sentAt: string, currentStep: "day_2" | "day_5" | "day_10") {
  const index = CORPORATE_DECISION_FOLLOWUP_STEPS.findIndex((step) => step.id === currentStep);
  const next = CORPORATE_DECISION_FOLLOWUP_STEPS[index + 1];
  if (!next) return null;
  const date = new Date(sentAt);
  date.setUTCDate(date.getUTCDate() + next.dueDays);
  return date.toISOString();
}

export type CorporateDecisionFollowupRun = {
  scanned: number;
  eligible: number;
  sent: number;
  stopped: number;
  skipped: number;
  failed: number;
  details: Array<Record<string, unknown>>;
};

export async function runCorporateDecisionNoteFollowups(
  supabase: SupabaseClient,
  options: { limit?: number; now?: Date } = {},
): Promise<CorporateDecisionFollowupRun> {
  const now = options.now || new Date();
  const limit = Math.min(500, Math.max(1, options.limit || 150));

  const { data: prospects, error: prospectError } = await supabase
    .from("corporate_prospects")
    .select("id,company_name,status,evidence,converted_contact_id,updated_at")
    .eq("brand_id", "zeneco")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (prospectError) throw new Error(prospectError.message);

  const candidates = (prospects || [])
    .map((prospect: any) => ({ prospect, state: stateFromEvidence(prospect.evidence) }))
    .filter((row): row is { prospect: any; state: CorporateDecisionNoteState } => Boolean(row.state));

  const contactIds = Array.from(new Set(
    candidates.map((row) => String(row.prospect.converted_contact_id || "")).filter(Boolean),
  ));

  const contactsById = new Map<string, any>();
  if (contactIds.length) {
    const { data: contacts, error: contactError } = await supabase
      .from("contacts")
      .select("id,name,email,pipeline_status,interactions,last_inbound_reply_at,do_not_contact,email_suppressed,unsubscribe_at,waiting_until,suppression_reason")
      .in("id", contactIds);
    if (contactError) throw new Error(contactError.message);
    for (const contact of contacts || []) contactsById.set(String(contact.id), contact);
  }

  const result: CorporateDecisionFollowupRun = {
    scanned: prospects?.length || 0,
    eligible: 0,
    sent: 0,
    stopped: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const { prospect, state } of candidates) {
    const contactId = String(prospect.converted_contact_id || "");
    const contact = contactsById.get(contactId);
    const sentAt = state.delivery?.sent_at || "";

    if (!contact || !sentAt || state.delivery?.status !== "sent") {
      result.skipped += 1;
      result.details.push({ prospectId: prospect.id, action: "skip", reason: !contact ? "missing_contact" : "report_not_sent" });
      continue;
    }
    if (state.followup?.completed_at || state.followup?.stopped_at) {
      result.skipped += 1;
      continue;
    }

    const waitingUntil = contact.waiting_until ? new Date(contact.waiting_until).getTime() : NaN;
    if (Number.isFinite(waitingUntil) && waitingUntil > now.getTime()) {
      result.skipped += 1;
      result.details.push({ prospectId: prospect.id, action: "skip", reason: "waiting_until" });
      continue;
    }

    const stopReason = corporateDecisionStopReason({
      reportSentAt: sentAt,
      lastInboundReplyAt: contact.last_inbound_reply_at,
      interactions: contact.interactions,
      pipelineStatus: contact.pipeline_status,
      doNotContact: contact.do_not_contact,
      emailSuppressed: contact.email_suppressed,
      unsubscribeAt: contact.unsubscribe_at,
    });

    if (stopReason) {
      await markCorporateDecisionNoteStopped(supabase, prospect.id, stopReason);
      result.stopped += 1;
      result.details.push({ prospectId: prospect.id, action: "stop", reason: stopReason });
      continue;
    }

    const ageDays = daysBetween(sentAt, now);
    const step = nextSequenceStep(state, ageDays);
    if (!step) {
      result.skipped += 1;
      continue;
    }

    const email = String(contact.email || "").trim().toLowerCase();
    if (!email) {
      await markCorporateDecisionNoteStopped(supabase, prospect.id, "missing_email");
      result.stopped += 1;
      continue;
    }

    result.eligible += 1;
    const params = {
      firstName: firstName(String(contact.name || state.report.contact_name || "")),
      companyName: String(prospect.company_name || state.report.company_name || "virksomheten"),
      report: state.report,
    };
    const subject = step.subject(params);
    const body = step.body(params);

    const send = await sendBrandEmail(supabase, {
      brandId: "zeneco",
      to: [email],
      subject,
      bodyText: body,
      bodyHtml: followupHtml(body),
      crmContactId: contactId,
    });

    if (!send.success) {
      const error = send.error || "Send failed";
      await logCorporateDecisionFollowupFailure(supabase, {
        contactId,
        stepId: step.id,
        subject,
        body,
        error,
      });

      if (send.skipped && /suppressed|manual advisor takeover|hard CRM email block/i.test(error)) {
        await markCorporateDecisionNoteStopped(supabase, prospect.id, "email_suppressed_or_manual_takeover");
        result.stopped += 1;
      } else {
        result.failed += 1;
      }
      result.details.push({ prospectId: prospect.id, action: "send_failed", step: step.id, error });
      continue;
    }

    await markCorporateDecisionFollowupSent(supabase, {
      prospectId: prospect.id,
      contactId,
      stepId: step.id,
      subject,
      body,
      messageId: send.messageId || null,
    });

    const nextFollowup = nextDueDate(sentAt, step.id);
    await supabase
      .from("contacts")
      .update({
        next_followup: nextFollowup,
        last_ai_followup: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", contactId);

    await supabase
      .from("corporate_prospects")
      .update({
        next_followup: nextFollowup,
        next_action: step.id === "day_10"
          ? "Automatisk oppfølging er avsluttet uten svar. Vurder manuell B2B-oppfølging, eller sett saken på hold."
          : "Vent på svar på beslutningsgrunnlaget. Ved svar eller booking stopper den automatiske sekvensen.",
        updated_at: now.toISOString(),
      })
      .eq("id", prospect.id)
      .eq("brand_id", "zeneco");

    if (step.id === "day_10") {
      const { data: existingWorkItem } = await supabase
        .from("work_items")
        .select("id")
        .eq("brand_id", "zeneco")
        .eq("source_type", "corporate_decision_note_no_reply")
        .eq("source_id", prospect.id)
        .maybeSingle();

      if (!existingWorkItem?.id) {
        await supabase.from("work_items").insert({
          title: `Corporate beslutningsgrunnlag uten svar · ${params.companyName}`,
          description: `${email} · Automatisk 2/5/10-dagerssekvens er fullført uten registrert svar eller booking.`,
          status: "TO_DO",
          priority: "MEDIUM",
          brand_id: "zeneco",
          source_type: "corporate_decision_note_no_reply",
          source_id: prospect.id,
          assigned_agent: "sales",
          next_action: "Vurder én personlig oppfølging basert på kontostrategien, eller sett saken på hold. Ikke start ny automatisk sekvens.",
          ai_score: 82,
          metadata: {
            segment: "corporate_homes",
            corporate_decision_note_request_id: state.request_id,
            contact_id: contactId,
            automated_sequence_completed: true,
          },
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        });
      }
    }

    result.sent += 1;
    result.details.push({ prospectId: prospect.id, action: "sent", step: step.id });
  }

  return result;
}
