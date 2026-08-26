export type NexusTodayPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface NexusTodayAction {
  id: string;
  source: "sales" | "system" | "marketing";
  priority: NexusTodayPriority;
  score: number;
  title: string;
  action: string;
  reason: string;
  impact: string;
  href: string;
}

type AttentionInput = {
  id: string;
  severity: "high" | "medium" | "low";
  score: number;
  title: string;
  detail: string;
  href: string;
};

type RevenueInput = {
  title: string;
  primaryAction: string;
  reason: string;
  href: string;
  priority: NexusTodayPriority;
  score: number;
} | null | undefined;

type MarketingBlocker = {
  brandId: string;
  brandName: string;
  platform?: string | null;
  pilotBlockReason?: string | null;
};

const priorityWeight: Record<NexusTodayPriority, number> = {
  CRITICAL: 400,
  HIGH: 300,
  MEDIUM: 200,
  LOW: 100,
};

function attentionPriority(severity: AttentionInput["severity"]): NexusTodayPriority {
  if (severity === "high") return "CRITICAL";
  if (severity === "medium") return "HIGH";
  return "MEDIUM";
}

export function buildNexusTodayTopActions(input: {
  attention: AttentionInput[];
  revenue: RevenueInput;
  marketingBlockers: MarketingBlocker[];
  quarantined: number;
  limit?: number;
}): NexusTodayAction[] {
  const actions: NexusTodayAction[] = [];

  if (input.revenue) {
    actions.push({
      id: "sales:recommended-play",
      source: "sales",
      priority: input.revenue.priority,
      score: priorityWeight[input.revenue.priority] + input.revenue.score,
      title: input.revenue.title,
      action: input.revenue.primaryAction,
      reason: input.revenue.reason,
      impact: "Salgsfremdrift: dette er Revenue Today sin høyest prioriterte mulighet akkurat nå.",
      href: input.revenue.href,
    });
  }

  for (const item of input.attention) {
    const priority = attentionPriority(item.severity);
    actions.push({
      id: `system:${item.id}`,
      source: "system",
      priority,
      score: priorityWeight[priority] + Math.max(0, item.score),
      title: item.title,
      action: "Kontroller og løs blokkeringen",
      reason: item.detail,
      impact: priority === "CRITICAL" ? "Driftsrisiko: kan blokkere eller svekke andre arbeidsflyter." : "Driftsfremdrift: bør ryddes før den utvikler seg til en blokkering.",
      href: item.href,
    });
  }

  if (input.quarantined > 0) {
    actions.push({
      id: "marketing:quarantine",
      source: "marketing",
      priority: "CRITICAL",
      score: priorityWeight.CRITICAL + Math.min(99, input.quarantined * 5),
      title: `${input.quarantined} publiseringer står i quarantine`,
      action: "Kontroller quarantine-køen",
      reason: "Publiseringer er stoppet av eksisterende sikkerhets- eller kvalitetsgate.",
      impact: "Distribusjonsrisiko: innhold kommer ikke videre før køen er kontrollert.",
      href: "/social-automation?view=attention",
    });
  }

  for (const row of input.marketingBlockers) {
    actions.push({
      id: `marketing:${row.brandId}:${row.platform || "channel"}`,
      source: "marketing",
      priority: "HIGH",
      score: priorityWeight.HIGH + 20,
      title: `${row.brandName} · ${row.platform || "kanal"}`,
      action: "Rydd kanalblokkeringen",
      reason: row.pilotBlockReason || "Kanalen er ikke klar for autopilot.",
      impact: "Vekstfremdrift: blokkerer planlagt distribusjon for merkevaren.",
      href: "/social-automation?view=attention",
    });
  }

  return actions
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "nb"))
    .slice(0, input.limit ?? 3);
}
