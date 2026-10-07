import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CORPORATE_DECISION_NOTE_BOOKING_URL,
  CORPORATE_DECISION_NOTE_SEQUENCE_ID,
  decisionNoteSummaryLines,
  firstName,
  type CorporateDecisionNoteReport,
  type CorporateDecisionNoteState,
} from "@/lib/corporate-decision-note";
import { sendBrandEmail } from "@/services/email/send-brand-email";
import { renderCorporateDecisionNotePdf } from "@/services/pdf/corporate-decision-note";

type JsonRecord = Record<string, any>;

function object(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function reportFilename(companyName: string) {
  const slug = companyName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "virksomhet";
  return `beslutningsgrunnlag-${slug.toLowerCase()}.pdf`;
}

function emailHtml(report: CorporateDecisionNoteReport, pdfAttached: boolean) {
  const first = firstName(report.contact_name);
  const summaryItems = decisionNoteSummaryLines(report)
    .map((line) => `<li style="margin:0 0 8px 0">${escapeHtml(line)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="no">
<body style="margin:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#17242a">
  <div style="max-width:680px;margin:0 auto;padding:32px 18px">
    <div style="background:#ffffff;border-radius:18px;padding:32px;border:1px solid #e0e3df">
      <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#8b6a31;font-weight:700;margin-bottom:10px">Zen Eco Homes · Corporate Homes</div>
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.1;margin:0 0 18px;color:#17242a">Beslutningsgrunnlag for ${escapeHtml(report.company_name)}</h1>
      <p style="font-size:16px;line-height:1.6;margin:0 0 18px">Hei ${escapeHtml(first)},</p>
      <p style="font-size:16px;line-height:1.6;margin:0 0 18px">Takk for forespørselen. Jeg har satt opp et første beslutningsgrunnlag med tallene og forutsetningene dere sendte inn. ${pdfAttached ? "PDF-en ligger vedlagt og kan brukes som arbeidsdokument internt." : "Hovedtallene står nedenfor. PDF-vedlegget kunne ikke opprettes automatisk, så saken er samtidig markert for manuell oppfølging hos oss."}</p>

      <div style="background:#edf3f0;border-radius:12px;padding:20px;margin:22px 0">
        <div style="font-weight:700;margin-bottom:10px">Kort oppsummert</div>
        <ul style="padding-left:20px;margin:0;font-size:15px;line-height:1.5">${summaryItems}</ul>
      </div>

      <p style="font-size:15px;line-height:1.6;margin:0 0 12px"><strong>Viktig:</strong> hotellalternativet er ikke behandlet som en automatisk besparelse, og verdiutviklingen er et scenario – ikke en prognose.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 18px">Neste nyttige steg er å kontrollere forutsetningene sammen og avklare område, boligtype og styrets krav. Da kan vi gå fra en generell modell til en kortliste med 3–5 boliger som faktisk passer.</p>

      <div style="margin:24px 0">
        <a href="${CORPORATE_DECISION_NOTE_BOOKING_URL}" style="display:inline-block;background:#17242a;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:8px">Book en kort samtale</a>
      </div>

      <p style="font-size:15px;line-height:1.6;margin:0 0 18px">Dere kan også bare svare på denne e-posten med hva dere ønsker å endre i tallene eller hva styret trenger for å kunne ta stilling.</p>
      <p style="font-size:15px;line-height:1.6;margin:0">Vennlig hilsen<br><strong>Freddy Bremseth</strong><br>Zen Eco Homes</p>
    </div>
    <p style="font-size:12px;line-height:1.5;color:#788287;margin:14px 8px 0">Beslutningsgrunnlaget er et planleggingsverktøy og ikke investerings-, skatte-, juridisk eller regnskapsråd.</p>
  </div>
</body>
</html>`;
}

function emailText(report: CorporateDecisionNoteReport, pdfAttached: boolean) {
  const first = firstName(report.contact_name);
  const summary = decisionNoteSummaryLines(report).map((line) => `– ${line}`).join("\n");
  return `Hei ${first},

Takk for forespørselen. Jeg har satt opp et første beslutningsgrunnlag for ${report.company_name} med tallene og forutsetningene dere sendte inn. ${pdfAttached ? "PDF-en ligger vedlagt og kan brukes som arbeidsdokument internt." : "Hovedtallene står nedenfor. PDF-vedlegget kunne ikke opprettes automatisk, så saken er samtidig markert for manuell oppfølging hos oss."}

Kort oppsummert:
${summary}

Viktig: hotellalternativet er ikke behandlet som en automatisk besparelse, og verdiutviklingen er et scenario – ikke en prognose.

Neste nyttige steg er å kontrollere forutsetningene sammen og avklare område, boligtype og styrets krav. Da kan vi gå fra en generell modell til en kortliste med 3–5 boliger som faktisk passer.

Book en kort samtale:
${CORPORATE_DECISION_NOTE_BOOKING_URL}

Dere kan også bare svare på denne e-posten med hva dere ønsker å endre i tallene eller hva styret trenger for å kunne ta stilling.

Vennlig hilsen
Freddy Bremseth
Zen Eco Homes

Beslutningsgrunnlaget er et planleggingsverktøy og ikke investerings-, skatte-, juridisk eller regnskapsråd.`;
}

async function updateDecisionNoteEvidence(
  supabase: SupabaseClient,
  prospectId: string,
  updater: (state: CorporateDecisionNoteState) => CorporateDecisionNoteState,
) {
  const { data: current, error: readError } = await supabase
    .from("corporate_prospects")
    .select("evidence")
    .eq("id", prospectId)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (readError || !current) return { ok: false, error: readError?.message || "Prospect not found" };

  const evidence = object(current.evidence);
  const state = object(evidence.corporate_decision_note) as CorporateDecisionNoteState;
  if (!state?.request_id || !state?.report) return { ok: false, error: "Decision note state missing" };

  const next = updater(state);
  const { error } = await supabase
    .from("corporate_prospects")
    .update({
      evidence: { ...evidence, corporate_decision_note: next },
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospectId)
    .eq("brand_id", "zeneco");

  return error ? { ok: false, error: error.message } : { ok: true };
}

async function logSequenceEvent(
  supabase: SupabaseClient,
  input: {
    contactId: string;
    stepId: string;
    subject: string;
    bodyPreview: string;
    status: "sent" | "failed" | "skipped";
    error?: string | null;
    sentAt?: string | null;
  },
) {
  const { error } = await supabase.from("lead_nurture_events").insert({
    contact_id: input.contactId,
    brand_id: "zeneco",
    sequence_id: CORPORATE_DECISION_NOTE_SEQUENCE_ID,
    step_id: input.stepId,
    channel: "email",
    subject: input.subject,
    body_preview: input.bodyPreview.slice(0, 500),
    status: input.status,
    dry_run: false,
    error: input.error || null,
    scheduled_for: new Date().toISOString(),
    sent_at: input.sentAt || null,
    created_at: new Date().toISOString(),
  });
  if (error) console.warn("[corporate-decision-note] nurture event log failed", error.message);
}

export async function sendCorporateDecisionNoteReport(
  supabase: SupabaseClient,
  input: {
    prospectId: string;
    contactId: string;
    email: string;
    report: CorporateDecisionNoteReport;
  },
) {
  const now = new Date().toISOString();
  const subject = `Beslutningsgrunnlag for ${input.report.company_name} – Zen Eco Homes`;

  let pdfBuffer: Buffer | null = null;
  let pdfError: string | null = null;
  try {
    pdfBuffer = await renderCorporateDecisionNotePdf(input.report);
  } catch (error) {
    pdfError = error instanceof Error ? error.message : "PDF generation failed";
    console.error("[corporate-decision-note] PDF generation failed", pdfError);
  }

  const send = await sendBrandEmail(supabase, {
    brandId: "zeneco",
    to: [input.email],
    subject,
    bodyText: emailText(input.report, Boolean(pdfBuffer)),
    bodyHtml: emailHtml(input.report, Boolean(pdfBuffer)),
    attachments: pdfBuffer ? [{
      filename: reportFilename(input.report.company_name),
      content: pdfBuffer,
      contentType: "application/pdf",
    }] : undefined,
    crmContactId: input.contactId,
  });

  const deliveryError = send.success ? null : send.error || "Email send failed";
  await updateDecisionNoteEvidence(supabase, input.prospectId, (state) => ({
    ...state,
    delivery: {
      ...state.delivery,
      status: send.success ? "sent" : "failed",
      sent_at: send.success ? now : state.delivery?.sent_at || null,
      message_id: send.messageId || state.delivery?.message_id || null,
      last_attempt_at: now,
      error: deliveryError || pdfError,
    },
  }));

  await logSequenceEvent(supabase, {
    contactId: input.contactId,
    stepId: "decision_note",
    subject,
    bodyPreview: emailText(input.report, Boolean(pdfBuffer)),
    status: send.success ? "sent" : "failed",
    error: deliveryError || pdfError,
    sentAt: send.success ? now : null,
  });

  if (pdfError) {
    const { data: existingPdfWorkItem } = await supabase
      .from("work_items")
      .select("id")
      .eq("brand_id", "zeneco")
      .eq("source_type", "corporate_decision_note_pdf_error")
      .eq("source_id", input.prospectId)
      .maybeSingle();

    if (!existingPdfWorkItem?.id) {
      await supabase.from("work_items").insert({
        title: `PDF må følges opp · ${input.report.company_name}`,
        description: `Beslutningsgrunnlaget ble sendt som e-post, men PDF-genereringen feilet. Kontakt: ${input.email}`,
        status: "TO_DO",
        priority: "HIGH",
        brand_id: "zeneco",
        source_type: "corporate_decision_note_pdf_error",
        source_id: input.prospectId,
        assigned_agent: "sales",
        next_action: "Kontroller rapportgrunnlaget, generer PDF manuelt og send den til kunden.",
        ai_score: 94,
        metadata: {
          contact_id: input.contactId,
          pdf_error: pdfError,
          corporate_decision_note: true,
        },
        created_at: now,
        updated_at: now,
      });
    }
  }

  if (send.success) {
    await supabase
      .from("contacts")
      .update({
        next_followup: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        last_ai_followup: now,
        updated_at: now,
      })
      .eq("id", input.contactId);
  }

  return {
    success: send.success,
    messageId: send.messageId || null,
    pdfAttached: Boolean(pdfBuffer),
    error: deliveryError,
    pdfError,
  };
}

export async function markCorporateDecisionNoteStopped(
  supabase: SupabaseClient,
  prospectId: string,
  reason: string,
) {
  const now = new Date().toISOString();
  return updateDecisionNoteEvidence(supabase, prospectId, (state) => ({
    ...state,
    followup: {
      ...state.followup,
      stopped_at: state.followup?.stopped_at || now,
      stop_reason: state.followup?.stop_reason || reason,
    },
  }));
}

export async function markCorporateDecisionFollowupSent(
  supabase: SupabaseClient,
  input: {
    prospectId: string;
    contactId: string;
    stepId: "day_2" | "day_5" | "day_10";
    subject: string;
    body: string;
    messageId?: string | null;
  },
) {
  const now = new Date().toISOString();
  const field = `${input.stepId}_sent_at` as "day_2_sent_at" | "day_5_sent_at" | "day_10_sent_at";

  await updateDecisionNoteEvidence(supabase, input.prospectId, (state) => ({
    ...state,
    followup: {
      ...state.followup,
      [field]: now,
      completed_at: input.stepId === "day_10" ? now : state.followup?.completed_at || null,
    },
  }));

  await logSequenceEvent(supabase, {
    contactId: input.contactId,
    stepId: input.stepId,
    subject: input.subject,
    bodyPreview: input.body,
    status: "sent",
    sentAt: now,
  });

  return now;
}

export async function logCorporateDecisionFollowupFailure(
  supabase: SupabaseClient,
  input: {
    contactId: string;
    stepId: string;
    subject: string;
    body: string;
    error: string;
  },
) {
  await logSequenceEvent(supabase, {
    contactId: input.contactId,
    stepId: input.stepId,
    subject: input.subject,
    bodyPreview: input.body,
    status: "failed",
    error: input.error,
  });
}
