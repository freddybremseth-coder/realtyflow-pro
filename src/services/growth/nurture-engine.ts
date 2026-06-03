import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBrandEmail } from "@/services/email/send-brand-email";
import { isLikelyBot } from "@/lib/spam";
import {
  getSequenceForBrand,
  renderTemplate,
  type NurtureSequence,
  type NurtureStep,
} from "@/services/growth/nurture-sequences";

// Hvilke statuser som nurtures avgjøres per sekvens (sequence.eligibleStatuses).
// Så snart et lead er kvalifisert / i samtale / vunnet / tapt, tar mennesket over.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface NurtureRunOptions {
  dryRun: boolean;
  brandId?: string;
  /** Maks antall kontakter som behandles i én kjøring (rate-sikring). */
  limit?: number;
  /** Behandle leads laget de siste N dager (eldre er "kalde"). */
  maxAgeDays?: number;
}

export interface NurturePlannedSend {
  contactId: string;
  name: string;
  email: string;
  brandId: string;
  stepId: string;
  subject: string;
  status: "sent" | "dry_run" | "failed" | "skipped";
  error?: string;
}

export interface NurtureRunResult {
  dryRun: boolean;
  scanned: number;
  eligible: number;
  planned: NurturePlannedSend[];
  sent: number;
  failed: number;
  skipped: number;
  flaggedSpam: number;
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return (Date.now() - t) / DAY_MS;
}

/** Finn det tidligste steget som er forfalt og ikke allerede sendt. */
function nextDueStep(
  sequence: NurtureSequence,
  ageDays: number,
  sentStepIds: Set<string>
): NurtureStep | null {
  for (const step of [...sequence.steps].sort((a, b) => a.dayOffset - b.dayOffset)) {
    if (sentStepIds.has(step.id)) continue;
    if (ageDays >= step.dayOffset) return step;
    return null; // stegene er sekvensielle – stopp ved første ikke-forfalte
  }
  return null;
}

export async function runNurtureCycle(
  supabase: SupabaseClient,
  options: NurtureRunOptions
): Promise<NurtureRunResult> {
  const { dryRun, brandId, limit = 50, maxAgeDays = 21 } = options;

  const result: NurtureRunResult = {
    dryRun,
    scanned: 0,
    eligible: 0,
    planned: [],
    sent: 0,
    failed: 0,
    skipped: 0,
    flaggedSpam: 0,
  };

  // Teller nye innmeldinger per sekvens denne kjøringen (for daglig bolk-tak).
  const enrollCounts = new Map<string, number>();

  let query = supabase
    .from("contacts")
    .select(
      "id, name, email, brand_id, brand, pipeline_status, nurture_status, property_interest, created_at, nurture_enrolled_at"
    )
    .order("created_at", { ascending: false })
    .limit(Math.max(limit, 1000));

  if (brandId) query = query.eq("brand_id", brandId);

  const { data: contacts, error } = await query;
  if (error) throw new Error(`contacts query failed: ${error.message}`);

  result.scanned = contacts?.length || 0;

  for (const contact of contacts || []) {
    const cBrand: string = contact.brand_id || contact.brand || "";
    const sequence = getSequenceForBrand(cBrand);
    if (!sequence) continue;

    const status = String(contact.pipeline_status || "").toUpperCase();
    const nurtureStatus = String(contact.nurture_status || "active");
    const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(contact.email || ""));

    if (!hasEmail) continue;
    if (nurtureStatus !== "active") continue;

    // Beskytt avsenderomdømmet: aldri send til åpenbar spam/bot.
    if (isLikelyBot(contact.name, contact.email)) {
      result.flaggedSpam += 1;
      if (!dryRun) {
        // Sett på pause (ikke slett) så de kan gjennomgås, og ikke
        // prosesseres på nytt hver kjøring.
        await supabase
          .from("contacts")
          .update({ nurture_status: "paused" })
          .eq("id", contact.id);
      }
      continue;
    }

    if (!sequence.eligibleStatuses.includes(status)) {
      // Leadet har gått videre – fullfør nurture stille.
      if (!dryRun) {
        await supabase
          .from("contacts")
          .update({ nurture_status: "completed" })
          .eq("id", contact.id);
      }
      continue;
    }

    // Velkomst-modus gjelder kun ferske leads; gamle leads i et velkomst-merke
    // skal ikke plutselig få en "velkommen". Reaktivering har ingen aldersgrense.
    if (sequence.mode === "welcome" && daysSince(contact.created_at) > maxAgeDays) continue;

    result.eligible += 1;

    // Hvilke steg er allerede reelt sendt/køet for dette leadet?
    const { data: events } = await supabase
      .from("lead_nurture_events")
      .select("step_id, status")
      .eq("contact_id", contact.id)
      .eq("sequence_id", sequence.id)
      .in("status", ["sent", "queued"]);

    const sentStepIds = new Set((events || []).map((e) => String(e.step_id)));

    const isReactivation = sequence.mode === "reactivation";
    const alreadyEnrolled = !!contact.nurture_enrolled_at;
    const isNewEnrollment = isReactivation && !alreadyEnrolled;

    // Daglig bolk-tak: begrens antall NYE reaktiverings-innmeldinger per kjøring.
    if (isNewEnrollment) {
      const cap = sequence.maxNewEnrollmentsPerRun ?? 25;
      if ((enrollCounts.get(sequence.id) ?? 0) >= cap) {
        result.skipped += 1;
        continue;
      }
    }

    // Anker for tidsregning: reaktivering teller fra innmelding (nå for nye),
    // velkomst teller fra da leadet kom inn (created_at).
    const anchor = isReactivation
      ? contact.nurture_enrolled_at || new Date().toISOString()
      : contact.nurture_enrolled_at || contact.created_at;
    const ageDays = daysSince(anchor);
    const step = nextDueStep(sequence, ageDays, sentStepIds);
    if (!step) continue;

    if (isNewEnrollment) {
      enrollCounts.set(sequence.id, (enrollCounts.get(sequence.id) ?? 0) + 1);
    }

    const ctx = {
      name: contact.name,
      area: contact.property_interest,
      advisor: sequence.advisor,
      brand: sequence.brandName,
      booking_url: sequence.bookingUrl,
    };
    const subject = renderTemplate(step.subject, ctx);
    const bodyText = renderTemplate(step.text, ctx);

    const planned: NurturePlannedSend = {
      contactId: contact.id,
      name: contact.name,
      email: contact.email,
      brandId: cBrand,
      stepId: step.id,
      subject,
      status: dryRun ? "dry_run" : "sent",
    };

    if (dryRun) {
      result.planned.push(planned);
      await supabase.from("lead_nurture_events").insert({
        contact_id: contact.id,
        brand_id: cBrand,
        sequence_id: sequence.id,
        step_id: step.id,
        channel: step.channel,
        subject,
        body_preview: bodyText.slice(0, 280),
        status: "dry_run",
        dry_run: true,
        scheduled_for: new Date().toISOString(),
      });
      continue;
    }

    // LIVE: send via merkets SMTP
    const send = await sendBrandEmail(supabase, {
      brandId: cBrand,
      to: [contact.email],
      subject,
      bodyText,
    });

    if (send.success) {
      planned.status = "sent";
      result.sent += 1;
      const now = new Date().toISOString();
      await supabase.from("lead_nurture_events").insert({
        contact_id: contact.id,
        brand_id: cBrand,
        sequence_id: sequence.id,
        step_id: step.id,
        channel: step.channel,
        subject,
        body_preview: bodyText.slice(0, 280),
        status: "sent",
        dry_run: false,
        scheduled_for: now,
        sent_at: now,
      });
      // Marker oppfølging på kontakten (bruker eksisterende CRM-felter).
      await supabase
        .from("contacts")
        .update({
          last_ai_followup: now,
          nurture_sequence: sequence.id,
          nurture_enrolled_at: contact.nurture_enrolled_at || anchor,
          pipeline_status: status === "NEW" || status === "" ? "CONTACT" : status,
          updated_at: now,
        })
        .eq("id", contact.id);
    } else {
      planned.status = "failed";
      planned.error = send.error;
      result.failed += 1;
      await supabase.from("lead_nurture_events").insert({
        contact_id: contact.id,
        brand_id: cBrand,
        sequence_id: sequence.id,
        step_id: step.id,
        channel: step.channel,
        subject,
        body_preview: bodyText.slice(0, 280),
        status: "failed",
        dry_run: false,
        error: send.error || "unknown",
      });
    }

    result.planned.push(planned);
  }

  return result;
}
