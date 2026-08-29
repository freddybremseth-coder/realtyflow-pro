import type { CustomerTimelineEvent } from "@/lib/customer-360";

export interface CustomerNurtureEventInput {
  id?: string | null;
  sequence_id?: string | null;
  step_id?: string | null;
  channel?: string | null;
  subject?: string | null;
  body_preview?: string | null;
  status?: string | null;
  dry_run?: boolean | null;
  error?: string | null;
  scheduled_for?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
}

function validDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function detail(row: CustomerNurtureEventInput) {
  const parts = [
    row.subject ? `Emne: ${row.subject}` : null,
    row.body_preview || null,
    row.error ? `Feil: ${row.error}` : null,
    row.sequence_id ? `Sekvens: ${row.sequence_id}` : null,
    row.step_id ? `Steg: ${row.step_id}` : null,
  ].filter(Boolean);
  return parts.join("\n") || null;
}

export function buildNurtureTimelineEvents(events: CustomerNurtureEventInput[]): CustomerTimelineEvent[] {
  return (events || []).flatMap((row, index) => {
    const occurredAt = validDate(row.sent_at || row.scheduled_for || row.created_at);
    if (!occurredAt) return [];

    const status = String(row.status || "").trim().toLowerCase();
    const dryRun = row.dry_run === true || status === "dry_run";
    const failed = Boolean(row.error) || status === "failed" || status === "error";
    const sent = Boolean(row.sent_at) && !dryRun && !failed;

    let title = "Nurture-hendelse";
    let direction: CustomerTimelineEvent["direction"] = "internal";
    if (dryRun) title = "Nurture-plan – ikke sendt";
    else if (failed) title = "Nurture-send feilet";
    else if (sent) {
      title = row.channel === "email" ? "Nurture-e-post sendt" : "Nurture-melding sendt";
      direction = "out";
    } else title = "Nurture planlagt";

    return [{
      id: String(row.id || `nurture-${index}-${occurredAt}`),
      kind: "interaction" as const,
      title,
      detail: detail(row),
      occurredAt,
      direction,
    }];
  });
}
