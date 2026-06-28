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
