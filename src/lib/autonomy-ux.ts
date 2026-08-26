export type AutonomyMode = "auto" | "guarded_auto" | "approval" | "blocked";

export interface AutonomyStage {
  id: "suggest" | "prepare" | "approval" | "execute" | "auto";
  label: string;
  description: string;
  enabled: boolean;
}

export function autonomyStages(mode: AutonomyMode): AutonomyStage[] {
  const rank: Record<AutonomyMode, number> = {
    blocked: 0,
    approval: 2,
    guarded_auto: 3,
    auto: 4,
  };
  const current = rank[mode];
  return [
    { id: "suggest", label: "Suggest", description: "Nexus kan anbefale hva som bør gjøres.", enabled: true },
    { id: "prepare", label: "Prepare", description: "Nexus kan klargjøre utkast eller handling uten å sende.", enabled: mode !== "blocked" },
    { id: "approval", label: "Approval", description: "Et menneske må godkjenne før execution når policy krever det.", enabled: current >= 2 },
    { id: "execute", label: "Execute", description: "Nexus kan utføre handlingen når guardrails er oppfylt.", enabled: current >= 3 },
    { id: "auto", label: "Auto", description: "Nexus kan kjøre uten manuell approval innen policy, confidence og rate limits.", enabled: current >= 4 },
  ];
}

export function autonomyModeSummary(mode: AutonomyMode) {
  if (mode === "auto") return "Kan kjøre autonomt innen confidence, rate limits og øvrige guardrails.";
  if (mode === "guarded_auto") return "Kan utføre automatisk når ekstra betingelser og sikkerhetsporter er oppfylt.";
  if (mode === "approval") return "Nexus kan foreslå og forberede, men menneskelig godkjenning kreves før execution.";
  return "Nexus kan forklare og anbefale, men handlingen er blokkert fra execution.";
}
