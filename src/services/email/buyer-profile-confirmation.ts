import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBrandEmail } from "@/services/email/send-brand-email";
import { checkCrmEmailSuppression } from "@/services/email/email-suppression";
import { extractLatestReplyText } from "@/services/email/latest-reply-text";
import { evaluateNexusExecutionBoundary } from "@/lib/nexus/execution-boundary";

const KEY_LABELS: Record<string, string> = {
  location: "Område",
  property_type: "Boligtype",
  total_budget: "Totalbudsjett",
  purchase_price: "Kjøpspris",
  estimated_total_cost: "Estimert total kostnad",
  bedrooms: "Soverom",
  bathrooms: "Bad",
  living_area_m2: "Boareal",
  plot_area_m2: "Tomtestørrelse",
  floor_position: "Etasje",
  parking: "Parkering",
  pool: "Basseng",
  distance_to_beach: "Avstand til strand",
};

const BROAD_LOCATION_VALUES = new Set([
  "spain",
  "spania",
  "espana",
  "españa",
  "costa blanca",
  "alicante",
  "valencia",
  "comunidad valenciana",
  "valencian community",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeLocation(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isBroadBuyerLocation(value: unknown) {
  return BROAD_LOCATION_VALUES.has(normalizeLocation(value));
}

function preferredLocations(analysis: unknown): string[] {
  const root = record(analysis);
  const locations = record(root.locations);
  return Array.isArray(locations.preferred)
    ? locations.preferred.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(value);
}

function formatCriterionValue(key: string, value: unknown) {
  if (typeof value === "number") {
    if (["total_budget", "purchase_price", "estimated_total_cost"].includes(key)) {
      return `€${formatNumber(value)}`;
    }
    if (["living_area_m2", "plot_area_m2"].includes(key)) return `${formatNumber(value)} m²`;
    return formatNumber(value);
  }
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(", ");
  if (typeof value === "boolean") return value ? "Ja" : "Nei";
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function addLine(lines: string[], seen: Set<string>, label: string, value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return;
  const normalized = `${label}:${text}`.toLowerCase();
  if (seen.has(normalized)) return;
  seen.add(normalized);
  lines.push(`${label}: ${text}`);
}

/** Build a conservative, customer-readable criteria summary from Nexus analysis metadata. */
export function buildBuyerCriteriaLines(analysis: unknown): string[] {
  const root = record(analysis);
  const lines: string[] = [];
  const seen = new Set<string>();

  const budget = record(root.budget);
  if (typeof budget.amount === "number" && Number.isFinite(budget.amount) && budget.amount > 0) {
    const currency = String(budget.currency || "EUR").toUpperCase();
    addLine(lines, seen, "Budsjett", `${currency} ${formatNumber(budget.amount)}`);
  }

  const locations = preferredLocations(root);
  if (locations.length > 0) {
    addLine(lines, seen, "Område", locations.join(", "));
  }

  if (Array.isArray(root.propertyTypes) && root.propertyTypes.length > 0) {
    addLine(lines, seen, "Boligtype", root.propertyTypes.map(String).filter(Boolean).join(", "));
  }

  for (const groupName of ["hardRequirements", "preferences", "exclusions"] as const) {
    const group = Array.isArray(root[groupName]) ? root[groupName] as unknown[] : [];
    for (const raw of group) {
      const item = record(raw);
      const key = String(item.key || "").trim();
      if (!key || key === "unknown") continue;
      const value = formatCriterionValue(key, item.value);
      if (!value) continue;
      const label = KEY_LABELS[key] || (key === "other" ? String(item.otherKey || "Annet") : key.replace(/_/g, " "));
      const prefix = groupName === "exclusions" ? `Ikke ${label.toLowerCase()}` : label;
      addLine(lines, seen, prefix, value);
      if (lines.length >= 8) return lines;
    }
  }

  return lines;
}

export function buildCriteriaConfirmationEmail(input: {
  customerName?: string | null;
  analysis: unknown;
}) {
  const firstName = String(input.customerName || "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Hei ${firstName},` : "Hei,";
  const criteriaLines = buildBuyerCriteriaLines(input.analysis);
  const locations = preferredLocations(input.analysis);
  const hasOnlyBroadLocations = locations.length > 0 && locations.every(isBroadBuyerLocation);

  if (hasOnlyBroadLocations) {
    const nonLocationCriteria = criteriaLines.filter((line) => !line.startsWith("Område:"));
    const knownBlock = nonLocationCriteria.length
      ? ["Så langt har jeg notert:", ...nonLocationCriteria.map((line) => `– ${line}`), ""]
      : [];

    return {
      mode: "location_clarification" as const,
      requiresConfirmation: false,
      subject: "Hvilket område i Spania er mest aktuelt?",
      bodyText: [
        greeting,
        "",
        "Takk for informasjonen. Jeg har notert at du ser etter bolig i Spania.",
        "",
        "For at jeg skal kunne finne boliger som faktisk er relevante for deg, trenger jeg å snevre inn søket litt.",
        "",
        ...knownBlock,
        "Hvilke områder eller byer er mest aktuelle for deg? Du kan gjerne svare med ett eller flere steder.",
        "",
        "Hvis du ikke har bestemt deg ennå, kan du også skrive hva som er viktigst for deg – for eksempel strand, rolig område, byliv, utsikt eller avstand til flyplass. Da kan jeg foreslå områder som passer bedre.",
        "",
        "Vennlig hilsen",
        "Freddy",
      ].join("\n"),
      criteriaLines,
      confirmationContextText: "",
    };
  }

  const criteriaBlock = criteriaLines.length > 0
    ? criteriaLines.map((line) => `– ${line}`).join("\n")
    : "– Jeg mangler fortsatt noen konkrete detaljer før søket kan oppdateres sikkert.";

  const bodyText = [
    greeting,
    "",
    "Takk for ytterligere informasjon. Jeg vil være sikker på at jeg bruker riktige kriterier i boligsøket fremover.",
    "",
    "Slik har jeg forstått ønskene dine nå:",
    criteriaBlock,
    "",
    "Kan du bekrefte at dette er kriteriene vi skal bruke i søket fremover?",
    "Svar gjerne bare «Ja, dette stemmer» hvis alt er riktig. Hvis noe skal endres, skriver du bare korrigeringen i svaret.",
    "",
    "Vennlig hilsen",
    "Freddy",
  ].join("\n");

  return {
    mode: "confirmation" as const,
    requiresConfirmation: true,
    subject: "Kan du bekrefte søkekriteriene dine?",
    bodyText,
    criteriaLines,
    confirmationContextText: [
      "Kunden har eksplisitt bekreftet at følgende kriterier skal brukes i boligsøk fremover:",
      ...criteriaLines.map((line) => `- ${line}`),
      "Kunden ønsker at boligjakten fortsetter med disse kriteriene.",
    ].join("\n"),
  };
}

export function isAffirmativeCriteriaConfirmation(value: string | null | undefined) {
  const latest = extractLatestReplyText(value || "") || String(value || "");
  const normalized = latest
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || normalized.length > 220) return false;
  if (/\b(nei|ikke|men|bortsett|endre|endring|feil|instead|except|not correct|no|wrong|pero|cambiar|incorrecto)\b/i.test(normalized)) return false;
  if (/\d/.test(normalized)) return false;

  return /^(ja|ja[, ]+(det )?(stemmer|er riktig)|det stemmer|stemmer|riktig|bekrefter|bekreftet|yes|yes[, ]+(that is )?correct|correct|confirmed|si|sí|sí[, ]+correcto|correcto)([,.! ]*(takk|thanks|gracias))?[.! ]*$/i.test(normalized);
}

export async function sendBuyerCriteriaConfirmation(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    contactId: string;
    reviewWorkItemId: string;
    sourceEmailMessageId: string;
    sourceWorkItemId: string;
    analysis: unknown;
  },
) {
  const contactResult = await supabase
    .from("contacts")
    .select("id,name,email")
    .eq("id", input.contactId)
    .maybeSingle();
  if (contactResult.error) throw contactResult.error;
  const contact = contactResult.data;
  const recipient = String(contact?.email || "").trim().toLowerCase();
  if (!recipient) return { sent: false as const, skipped: true as const, reason: "contact_missing_email" };

  const email = buildCriteriaConfirmationEmail({ customerName: contact?.name, analysis: input.analysis });
  if (email.criteriaLines.length === 0) {
    return { sent: false as const, skipped: true as const, reason: "no_customer_readable_criteria" };
  }

  const now = new Date().toISOString();
  const idempotencyKey = `sha256:v1:${createHash("sha256").update([
    "criteria-confirmation-v1",
    input.brandId,
    input.contactId,
    input.reviewWorkItemId,
    input.sourceEmailMessageId,
    input.sourceWorkItemId,
    email.mode,
    recipient,
  ].join(":"), "utf8").digest("hex")}`;

  const reviewLookup = await supabase
    .from("work_items")
    .select("metadata")
    .eq("id", input.reviewWorkItemId)
    .maybeSingle();
  if (reviewLookup.error) throw reviewLookup.error;
  const currentMetadata = record(reviewLookup.data?.metadata);
  const priorExecutionKey = String(currentMetadata.confirmation_execution_idempotency_key || "");
  const priorExecutionStatus = String(currentMetadata.confirmation_execution_status || "").toLowerCase();
  if (priorExecutionKey === idempotencyKey && ["sending", "sent", "ambiguous"].includes(priorExecutionStatus)) {
    return { sent: false as const, skipped: true as const, duplicate: true as const, reason: `duplicate_${priorExecutionStatus}` };
  }

  const [suppression, sender] = await Promise.all([
    checkCrmEmailSuppression(supabase, [recipient]),
    supabase.from("brand_email_configs")
      .select("id")
      .eq("brand_id", input.brandId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);
  const preflightPassed = !suppression.error && !suppression.blocked && Boolean(sender.data?.length) && !sender.error;
  if (!preflightPassed) {
    const reason = suppression.error
      ? `suppression_check_failed:${suppression.error}`
      : suppression.blocked
        ? "recipient_suppressed"
        : sender.error
          ? `sender_check_failed:${sender.error.message}`
          : "sender_not_configured";
    return { sent: false as const, skipped: true as const, reason };
  }

  const claimedMetadata = {
    ...currentMetadata,
    confirmation_execution_action: "criteria_clarification_email",
    confirmation_execution_idempotency_key: idempotencyKey,
    confirmation_execution_status: "sending",
    confirmation_execution_claimed_at: now,
    confirmation_execution_audit: "work_items.metadata",
  };
  const claim = await supabase
    .from("work_items")
    .update({ metadata: claimedMetadata, updated_at: now })
    .eq("id", input.reviewWorkItemId);
  if (claim.error) throw claim.error;

  const executionBoundary = evaluateNexusExecutionBoundary("criteria_clarification_email", {
    executorEnabled: true,
    evidenceSatisfied: Boolean(email.criteriaLines.length && input.sourceEmailMessageId && input.sourceWorkItemId),
    auditTrailReady: true,
    idempotencyKey,
    freshPreflight: { passed: preflightPassed, checkedAt: now },
  });
  if (!executionBoundary.automaticExecutionAllowed) {
    const reason = `execution_boundary:${executionBoundary.blockers.join(",")}`;
    await supabase.from("work_items").update({
      metadata: { ...claimedMetadata, confirmation_execution_status: "blocked", confirmation_execution_error: reason },
      updated_at: new Date().toISOString(),
    }).eq("id", input.reviewWorkItemId);
    return { sent: false as const, skipped: true as const, reason };
  }

  const sent = await sendBrandEmail(supabase, {
    brandId: input.brandId,
    to: [recipient],
    subject: email.subject,
    bodyText: email.bodyText,
  });

  const completedAt = new Date().toISOString();
  const nextMetadata = {
    ...claimedMetadata,
    confirmation_pending: sent.success && email.requiresConfirmation,
    confirmation_requested_at: sent.success && email.requiresConfirmation ? now : null,
    criteria_clarification_requested_at: sent.success && !email.requiresConfirmation ? now : null,
    confirmation_message_id: sent.messageId || null,
    confirmation_recipient: recipient,
    confirmation_source_email_message_id: input.sourceEmailMessageId,
    confirmation_source_work_item_id: input.sourceWorkItemId,
    confirmation_criteria_lines: email.criteriaLines,
    confirmation_context_text: email.confirmationContextText,
    confirmation_message_mode: email.mode,
    confirmation_send_status: sent.success ? "sent" : (sent.skipped ? "skipped" : "failed"),
    confirmation_send_error: sent.success ? null : sent.error || null,
    confirmation_execution_status: sent.success ? "sent" : (sent.skipped ? "blocked" : "failed"),
    confirmation_execution_completed_at: completedAt,
    confirmation_execution_error: sent.success ? null : sent.error || null,
    performed_by: "Nexus Criteria Confirmation Autopilot",
  };

  const update = await supabase
    .from("work_items")
    .update({ metadata: nextMetadata, updated_at: completedAt })
    .eq("id", input.reviewWorkItemId);
  if (update.error) throw update.error;

  return sent.success
    ? {
        sent: true as const,
        skipped: false as const,
        messageId: sent.messageId || null,
        criteriaLines: email.criteriaLines,
        mode: email.mode,
        requiresConfirmation: email.requiresConfirmation,
      }
    : { sent: false as const, skipped: Boolean(sent.skipped), reason: sent.error || "send_failed" };
}
