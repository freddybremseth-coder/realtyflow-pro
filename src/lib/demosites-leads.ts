export type DemoSiteLeadStatus =
  | "new"
  | "queued"
  | "scanned"
  | "qualified"
  | "demo_created"
  | "outreach_ready"
  | "contacted"
  | "responded"
  | "converted"
  | "not_fit"
  | "opted_out"
  | "archived";

export type DemoSiteOutreachStatus =
  | "not_prepared"
  | "drafted"
  | "needs_review"
  | "approved"
  | "sent"
  | "replied"
  | "declined"
  | "opted_out";

export type DemoSiteAuditIssueSeverity = "low" | "medium" | "high";

export type DemoSiteAuditIssue = {
  key: string;
  title: string;
  severity: DemoSiteAuditIssueSeverity;
  explanation: string;
  improvement: string;
};

export type DemoSiteLeadAuditInput = {
  isMobileFriendly?: boolean | null;
  hasModernDesign?: boolean | null;
  hasClearContact?: boolean | null;
  hasCallToAction?: boolean | null;
  hasFastLoad?: boolean | null;
  hasSsl?: boolean | null;
  hasSocialProof?: boolean | null;
};

export type DemoSiteLeadRecommendationInput = {
  id: string;
  company_name?: string | null;
  website_url?: string | null;
  domain?: string | null;
  city?: string | null;
  industry?: string | null;
  lead_status?: DemoSiteLeadStatus | string | null;
  outreach_status?: DemoSiteOutreachStatus | string | null;
  demo_preview_url?: string | null;
  demo_claim_url?: string | null;
  last_scanned_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DemoSiteRecommendedLeadPlay = {
  leadId: string;
  companyName: string;
  title: string;
  primaryAction: string;
  reason: string;
  href: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  score: number;
};

export const DEMO_SITE_AUDIT_ISSUES: Record<string, DemoSiteAuditIssue> = {
  not_mobile_friendly: {
    key: "not_mobile_friendly",
    title: "Nettsiden virker ikke godt nok på mobil",
    severity: "high",
    explanation: "Mange kunder besøker lokale bedrifter fra mobil. En svak mobilside kan gi færre henvendelser.",
    improvement: "DemoSites kan gi en tydelig mobilvennlig side med raske kontaktvalg.",
  },
  outdated_design: {
    key: "outdated_design",
    title: "Designet virker utdatert",
    severity: "medium",
    explanation: "Førsteinntrykket kan gjøre at kunden mister tillit før de tar kontakt.",
    improvement: "DemoSites kan gi et mer moderne uttrykk med bedriftens logo, farger og bilder.",
  },
  unclear_contact: {
    key: "unclear_contact",
    title: "Kontaktinformasjon er ikke tydelig nok",
    severity: "high",
    explanation: "Når telefon, e-post eller skjema er vanskelig å finne, mister bedriften potensielle leads.",
    improvement: "DemoSites kan gjøre kontakt enklere med faste knapper, skjema og tydelige kontaktfelter.",
  },
  weak_cta: {
    key: "weak_cta",
    title: "Mangler tydelig neste steg",
    severity: "medium",
    explanation: "Besøkende bør raskt forstå hva de kan gjøre videre: ringe, be om tilbud eller bestille.",
    improvement: "DemoSites kan legge inn tydelige call-to-action-knapper gjennom hele siden.",
  },
  slow_loading: {
    key: "slow_loading",
    title: "Siden kan oppleves treg",
    severity: "medium",
    explanation: "Trege sider gir dårlig brukeropplevelse og kan føre til at kunder forlater siden.",
    improvement: "DemoSites kan gi en lettere og mer fokusert landingsside for nye henvendelser.",
  },
  no_ssl: {
    key: "no_ssl",
    title: "Sikkerhet/SSL bør forbedres",
    severity: "high",
    explanation: "En side uten tydelig sikker tilkobling kan svekke tilliten hos kunden.",
    improvement: "DemoSites leveres med moderne hosting og sikker tilkobling.",
  },
  weak_trust: {
    key: "weak_trust",
    title: "Mangler tillitsskapende innhold",
    severity: "low",
    explanation: "Referanser, bilder, omtaler og tydelig beskrivelse gjør det lettere for kunden å velge bedriften.",
    improvement: "DemoSites kan strukturere tjenester, bilder og kundetillit på en mer salgsvennlig måte.",
  },
};

export function buildDemoSiteAuditIssues(input: DemoSiteLeadAuditInput) {
  const issues: DemoSiteAuditIssue[] = [];

  if (input.isMobileFriendly === false) issues.push(DEMO_SITE_AUDIT_ISSUES.not_mobile_friendly);
  if (input.hasModernDesign === false) issues.push(DEMO_SITE_AUDIT_ISSUES.outdated_design);
  if (input.hasClearContact === false) issues.push(DEMO_SITE_AUDIT_ISSUES.unclear_contact);
  if (input.hasCallToAction === false) issues.push(DEMO_SITE_AUDIT_ISSUES.weak_cta);
  if (input.hasFastLoad === false) issues.push(DEMO_SITE_AUDIT_ISSUES.slow_loading);
  if (input.hasSsl === false) issues.push(DEMO_SITE_AUDIT_ISSUES.no_ssl);
  if (input.hasSocialProof === false) issues.push(DEMO_SITE_AUDIT_ISSUES.weak_trust);

  return issues;
}

export function scoreDemoSiteLead(issues: DemoSiteAuditIssue[]) {
  const penalty = issues.reduce((sum, issue) => {
    if (issue.severity === "high") return sum + 18;
    if (issue.severity === "medium") return sum + 11;
    return sum + 6;
  }, 0);

  return Math.max(0, Math.min(100, 100 - penalty));
}

export function shouldQualifyLead(score: number, issues: DemoSiteAuditIssue[]) {
  const hasHighIssue = issues.some((issue) => issue.severity === "high");
  return score <= 78 || hasHighIssue;
}

function metadataNumber(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function activeLeadStatus(value: unknown) {
  return String(value || "new").trim().toLowerCase();
}

function activeOutreachStatus(value: unknown) {
  return String(value || "not_prepared").trim().toLowerCase();
}

function hasDemoLink(lead: DemoSiteLeadRecommendationInput) {
  return Boolean(String(lead.demo_preview_url || lead.demo_claim_url || "").trim());
}

function isClosedDemoSiteLead(lead: DemoSiteLeadRecommendationInput) {
  return ["converted", "not_fit", "opted_out", "archived"].includes(activeLeadStatus(lead.lead_status))
    || ["declined", "opted_out"].includes(activeOutreachStatus(lead.outreach_status));
}

function scoreDemoSiteRecommendedLead(lead: DemoSiteLeadRecommendationInput) {
  const status = activeLeadStatus(lead.lead_status);
  const outreach = activeOutreachStatus(lead.outreach_status);
  const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
  const auditScore = metadataNumber(metadata, "last_audit_score");
  let score = 20;

  if (status === "responded") score += 55;
  else if (status === "contacted" || outreach === "sent" || outreach === "replied") score += 45;
  else if (status === "outreach_ready" || outreach === "approved") score += 42;
  else if (status === "demo_created") score += 34;
  else if (status === "qualified") score += 30;
  else if (status === "scanned") score += 24;
  else if (status === "queued") score += 18;

  if (hasDemoLink(lead)) score += 14;
  if (lead.website_url || lead.domain) score += 8;
  if (lead.industry) score += 4;
  if (auditScore !== null && auditScore <= 78) score += 12;
  if (metadataNumber(metadata, "issue_count")) score += 6;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function priorityFromDemoSiteScore(score: number): DemoSiteRecommendedLeadPlay["priority"] {
  if (score >= 85) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}

function actionForDemoSiteLead(lead: DemoSiteLeadRecommendationInput) {
  const status = activeLeadStatus(lead.lead_status);
  const outreach = activeOutreachStatus(lead.outreach_status);
  const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
  const auditScore = metadataNumber(metadata, "last_audit_score");
  const issueCount = metadataNumber(metadata, "issue_count");

  if (status === "responded" || outreach === "replied") {
    return "Svar mens interessen er varm og book en konkret 10-minutters demo-session.";
  }
  if (status === "contacted" || outreach === "sent") {
    return "Følg opp manuelt: ring eller send kort check-in med én grunn til å se demoen.";
  }
  if (status === "outreach_ready" || outreach === "approved") {
    return "Send eller ring manuelt med godkjent outreach og foreslå en kort demo-session.";
  }
  if (status === "demo_created" && hasDemoLink(lead)) {
    return "Kvalitetssjekk demoen, gjør claim-lenken klar og lag personlig outreach.";
  }
  if (status === "qualified" || (auditScore !== null && auditScore <= 78)) {
    return "Lag privat DemoSite-preview som viser forbedringene kunden faktisk mangler.";
  }
  if (status === "scanned") {
    return "Vurder audit-funnene, kvalifiser leadet og bestem om demo skal lages.";
  }
  if (status === "queued" && (lead.website_url || lead.domain)) {
    return "Kjør URL-audit og hent bransje, kontaktpunkter, svakheter og demo-vinkel.";
  }
  return "Finn nettside/kontaktinfo og legg leadet klart for scanning.";
}

function reasonForDemoSiteLead(lead: DemoSiteLeadRecommendationInput, score: number) {
  const status = activeLeadStatus(lead.lead_status);
  const outreach = activeOutreachStatus(lead.outreach_status);
  const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
  const auditScore = metadataNumber(metadata, "last_audit_score");
  const issueCount = metadataNumber(metadata, "issue_count");
  const reasons = [
    `status: ${status}`,
    outreach !== "not_prepared" ? `outreach: ${outreach}` : null,
    hasDemoLink(lead) ? "demo/claim-lenke finnes" : null,
    auditScore !== null ? `audit-score ${auditScore}/100` : null,
    issueCount ? `${issueCount} audit-funn` : null,
    lead.website_url || lead.domain ? "nettside finnes" : null,
    `prioritet ${score}/100`,
  ];
  return reasons.filter(Boolean).join(" · ");
}

export function buildRecommendedDemoSiteLeadPlay(
  leads: DemoSiteLeadRecommendationInput[],
): DemoSiteRecommendedLeadPlay | null {
  const candidates = leads
    .filter((lead) => lead.id && !isClosedDemoSiteLead(lead))
    .map((lead) => {
      const score = scoreDemoSiteRecommendedLead(lead);
      return { lead, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best) return null;

  const companyName = String(best.lead.company_name || best.lead.domain || "Ukjent DemoSites-lead");
  return {
    leadId: best.lead.id,
    companyName,
    title: `Neste DemoSites-play: ${companyName}`,
    primaryAction: actionForDemoSiteLead(best.lead),
    reason: reasonForDemoSiteLead(best.lead, best.score),
    href: `/revenue-engine?lead=${encodeURIComponent(best.lead.id)}`,
    priority: priorityFromDemoSiteScore(best.score),
    score: best.score,
  };
}
