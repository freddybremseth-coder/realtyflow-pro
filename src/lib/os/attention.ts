export type AttentionSeverity = "high" | "medium" | "low";

export type OsAttentionItem = {
  id: string;
  severity: AttentionSeverity;
  score: number;
  title: string;
  detail: string;
  href: string;
  source: string;
};

export type OsAttentionInput = {
  sourceErrors: Array<{ source: string; message: string; href: string }>;
  approvalsPending: number;
  approvalsHighRisk: number;
  approvalOpportunityEur: number;
  automationFailures24h: number;
  automationPartial24h: number;
  scheduledAutomationStale: Array<{ action: string; label: string; lastRunAt: string | null; expectedMinutes: number; href: string }>;
  emailAccountsNotReady: number;
  emailAccountsSystemPaused: number;
  socialSyncEnabled: boolean;
  socialLastSyncAt: string | null;
  socialLastSyncStatus: string | null;
  instagramConnected: number;
  instagramCommentReadReady: number;
  socialSkippedMissingCapability: number;
  socialAutoReplyLive: boolean;
  bookPending: number;
  bookApproved: number;
  bookApplied: number;
  bookMeasuring: number;
  bookRunningExperiments: number;
  bookReviewCandidatesPending: number;
};

function ageMinutes(value: string | null, now: Date) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now.getTime() - time) / 60_000));
}

export function buildOsAttention(input: OsAttentionInput, now = new Date()): OsAttentionItem[] {
  const items: OsAttentionItem[] = [];

  for (const error of input.sourceErrors) {
    items.push({
      id: `source:${error.source}`,
      severity: "high",
      score: 100,
      title: `${error.source} kan ikke leses`,
      detail: error.message,
      href: error.href,
      source: error.source,
    });
  }

  if (input.automationFailures24h > 0) {
    items.push({
      id: "automation:failures",
      severity: "high",
      score: 96,
      title: `${input.automationFailures24h} automasjonsfeil siste 24 timer`,
      detail: "Åpne Automation Center og kontroller siste feilede kjøringer før nye autonome steg får fortsette.",
      href: "/automation",
      source: "Automation",
    });
  } else if (input.automationPartial24h > 0) {
    items.push({
      id: "automation:partial",
      severity: "medium",
      score: 72,
      title: `${input.automationPartial24h} delvise automasjonskjøringer siste 24 timer`,
      detail: "Kjøringene fullførte ikke helt rent. Se detaljene før du tolker subsystemet som grønt.",
      href: "/automation",
      source: "Automation",
    });
  }

  if (input.emailAccountsSystemPaused > 0) {
    items.push({
      id: "email:system-paused",
      severity: "high",
      score: 92,
      title: `${input.emailAccountsSystemPaused} e-postkonto${input.emailAccountsSystemPaused === 1 ? "" : "er"} er systempauset`,
      detail: "Nexus har stoppet auto-fetch for minst én konto. Åpne Email Readiness og verifiser credentials/IMAP før reconnect eller historisk backfill vurderes.",
      href: "/nexus-os/communications/readiness",
      source: "Email",
    });
  } else if (input.emailAccountsNotReady > 0) {
    items.push({
      id: "email:not-ready",
      severity: "medium",
      score: 74,
      title: `${input.emailAccountsNotReady} e-postkonto${input.emailAccountsNotReady === 1 ? "" : "er"} er ikke klare`,
      detail: "Kontoene mangler verifisert readiness for stabil drift eller historisk backfill. Connection-check er diagnostikk og aktiverer ikke kontoen automatisk.",
      href: "/nexus-os/communications/readiness",
      source: "Email",
    });
  }

  if (input.scheduledAutomationStale.length > 0) {
    const labels = input.scheduledAutomationStale.map((job) => {
      const age = ageMinutes(job.lastRunAt, now);
      return `${job.label}: ${age === null ? "ingen logg" : `${age} min siden`}`;
    });
    items.push({
      id: "automation:scheduler-stale",
      severity: "high",
      score: 93,
      title: `${input.scheduledAutomationStale.length} aktiv scheduler-jobb${input.scheduledAutomationStale.length === 1 ? "" : "er"} mangler fersk kjøring`,
      detail: `${labels.join(" · ")}. En aktiv Runtime/cron-konfigurasjon er ikke nok; Nexus krever fersk faktisk execution-logg.`,
      href: input.scheduledAutomationStale[0]?.href || "/automation",
      source: "Automation",
    });
  }

  if (input.socialAutoReplyLive) {
    items.push({
      id: "social:auto-reply-live",
      severity: "high",
      score: 94,
      title: "Social Auto-Reply LIVE er aktiv",
      detail: "Dette er en high-risk write-path. Bekreft at dette er tilsiktet og at scopes, rate limits og policy fortsatt er gyldige.",
      href: "/nexus-os/runtime",
      source: "Social",
    });
  }

  if (input.approvalsPending > 0) {
    const opportunity = input.approvalOpportunityEur > 0
      ? ` · ca. €${Math.round(input.approvalOpportunityEur).toLocaleString("nb-NO")} estimert opportunity`
      : "";
    items.push({
      id: "approvals:pending",
      severity: input.approvalsHighRisk > 0 ? "high" : "medium",
      score: input.approvalsHighRisk > 0 ? 90 : 82,
      title: `${input.approvalsPending} approval${input.approvalsPending === 1 ? "" : "s"} venter menneskelig beslutning`,
      detail: `${input.approvalsHighRisk} high-risk${opportunity}. Approval betyr ikke utført handling; executor forblir separat.`,
      href: "/approvals",
      source: "Approvals",
    });
  }

  const syncAge = ageMinutes(input.socialLastSyncAt, now);
  if (input.socialSyncEnabled && (!input.socialLastSyncAt || (syncAge !== null && syncAge > 35))) {
    items.push({
      id: "social:sync-stale",
      severity: "high",
      score: 88,
      title: "Social Inbox Sync er stale eller mangler kjøring",
      detail: input.socialLastSyncAt ? `Siste loggede sync er ${syncAge} minutter gammel.` : "Ingen vellykket sync-logg er registrert.",
      href: "/nexus-os/communications/social",
      source: "Social",
    });
  } else if (input.socialSyncEnabled && input.socialLastSyncStatus && input.socialLastSyncStatus !== "success") {
    items.push({
      id: "social:sync-status",
      severity: "high",
      score: 86,
      title: `Siste Social Inbox Sync har status ${input.socialLastSyncStatus}`,
      detail: "Kontroller sync-loggen før 0 aktivitet tolkes som reelt 0.",
      href: "/nexus-os/communications/social",
      source: "Social",
    });
  }

  if (input.instagramConnected > input.instagramCommentReadReady || input.socialSkippedMissingCapability > 0) {
    const missing = Math.max(input.instagramConnected - input.instagramCommentReadReady, input.socialSkippedMissingCapability);
    items.push({
      id: "social:instagram-scope",
      severity: "medium",
      score: 70,
      title: `${missing} Meta/Instagram-kanal${missing === 1 ? "" : "er"} mangler comment-read capability`,
      detail: "Disse kanalene er ukjent/skipped i inbox-målingen, ikke 0 aktivitet. Re-authorize communications i Connections.",
      href: "/connections",
      source: "Social",
    });
  }

  if (input.bookPending > 0 || input.bookReviewCandidatesPending > 0) {
    items.push({
      id: "book-growth:review",
      severity: "medium",
      score: 58,
      title: `${input.bookPending} Book Growth-recommendations + ${input.bookReviewCandidatesPending} strukturelle kandidater venter review`,
      detail: `${input.bookApproved} approved · ${input.bookApplied} applied · ${input.bookMeasuring} measuring · ${input.bookRunningExperiments} running experiments. Ingen kandidat blir auto-applied.`,
      href: "/book-growth",
      source: "Book Growth",
    });
  }

  if (!items.length) {
    items.push({
      id: "os:clear",
      severity: "low",
      score: 1,
      title: "Ingen tydelige OS-signaler krever handling nå",
      detail: "De verifiserte datakildene rapporterer ingen åpenbar blokkering eller feil.",
      href: "/today",
      source: "Nexus OS",
    });
  }

  const severityRank: Record<AttentionSeverity, number> = { high: 3, medium: 2, low: 1 };
  return items.sort((a, b) => b.score - a.score || severityRank[b.severity] - severityRank[a.severity || "low"] || a.title.localeCompare(b.title));
}
