import {
  TEAM_CAPACITY_BALANCED_THRESHOLD,
  TEAM_CAPACITY_HIGH_THRESHOLD,
  type TeamMemberWorkload,
  type TeamWorkloadItem,
  type TeamWorkloadWorkspace,
} from "./team-workload";

export type TeamCapacityTrendPattern = "PERSISTENT_HIGH" | "RISING" | "SPIKE" | "STABLE";
export type TeamCapacityIntervention =
  | "REDISTRIBUTE"
  | "AUTOMATE"
  | "ROLE_REBALANCE"
  | "STAFFING_REVIEW"
  | "MONITOR";

export type TeamCapacityTrendWeek = {
  index: number;
  start: string;
  end: string;
  score: number;
  load: TeamMemberWorkload["load"];
  driverCount: number;
  kinds: Record<"FOLLOW_UP" | "VIEWING" | "CLOSING" | "CAMPAIGN" | "TASK" | "PIPELINE", number>;
};

export type TeamCapacityTrendMember = {
  email: string;
  displayName: string;
  role: TeamMemberWorkload["role"];
  responsibilityAreas: number;
  currentCapacityScore: number;
  pattern: TeamCapacityTrendPattern;
  highWeeks: number;
  risingWeeks: number;
  dominantKind: keyof TeamCapacityTrendWeek["kinds"] | null;
  intervention: TeamCapacityIntervention;
  interventionLabel: string;
  rationale: string;
  confidence: "high" | "medium" | "low";
  weeks: TeamCapacityTrendWeek[];
};

export type TeamCapacityTrend = {
  generatedAt: string;
  horizonDays: number;
  members: TeamCapacityTrendMember[];
  attentionMembers: TeamCapacityTrendMember[];
  summary: {
    persistentHigh: number;
    rising: number;
    spike: number;
    automationCandidates: number;
    staffingReviewCandidates: number;
    roleRebalanceCandidates: number;
  };
};

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function kind(item: TeamWorkloadItem): keyof TeamCapacityTrendWeek["kinds"] {
  const text = `${item.title} ${item.detail}`.toLowerCase();
  if (item.stage === "VIEWING" || /visning|viewing/.test(text)) return "VIEWING";
  if (item.stage === "NEGOTIATION" || item.stage === "WON" || /closing|notary|reservation|overtak/.test(text)) return "CLOSING";
  if (item.resourceType === "CONTACT") return "FOLLOW_UP";
  if (/campaign|kampanje|marketing|utm|newsletter|nyhetsbrev|content/.test(text)) return "CAMPAIGN";
  return "TASK";
}

function contribution(item: TeamWorkloadItem, scheduled = true) {
  let score = scheduled ? item.score : Math.round(item.score * 0.3);
  if (item.stage === "VIEWING") score += 15;
  if (item.stage === "NEGOTIATION") score += 25;
  if (item.stage === "WON") score += 15;
  if (item.resourceType === "TASK" && item.recommendedRoles.includes("MARKETING")) score += 10;
  return Math.min(120, score);
}

function load(score: number, responsibilityAreas: number): TeamMemberWorkload["load"] {
  if (score === 0 && responsibilityAreas === 0) return "EMPTY";
  if (score >= TEAM_CAPACITY_HIGH_THRESHOLD || responsibilityAreas >= 6) return "HIGH";
  if (score >= TEAM_CAPACITY_BALANCED_THRESHOLD || responsibilityAreas >= 3) return "BALANCED";
  return "LIGHT";
}

function weekBounds(now: Date, index: number, horizonDays: number) {
  const startDay = index * 7;
  const endDay = index === 3 ? horizonDays : Math.min(horizonDays, (index + 1) * 7);
  const start = new Date(now.getTime() + startDay * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + endDay * 24 * 60 * 60 * 1000);
  return { start, end };
}

function emptyKinds(): TeamCapacityTrendWeek["kinds"] {
  return { FOLLOW_UP: 0, VIEWING: 0, CLOSING: 0, CAMPAIGN: 0, TASK: 0, PIPELINE: 0 };
}

function dominantKind(weeks: TeamCapacityTrendWeek[]) {
  const totals = emptyKinds();
  for (const week of weeks) {
    for (const [key, value] of Object.entries(week.kinds)) {
      totals[key as keyof typeof totals] += value;
    }
  }
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[1] ? entries[0][0] as keyof typeof totals : null;
}

function risingCount(scores: number[]) {
  let count = 0;
  for (let i = 1; i < scores.length; i += 1) {
    if (scores[i] > scores[i - 1] + 20) count += 1;
  }
  return count;
}

function hasSpareRoleCapacity(team: TeamWorkloadWorkspace, source: TeamMemberWorkload) {
  return team.members.some(member =>
    member.email !== source.email &&
    member.role === source.role &&
    member.load !== "HIGH");
}

function interventionFor(params: {
  pattern: TeamCapacityTrendPattern;
  dominant: keyof TeamCapacityTrendWeek["kinds"] | null;
  member: TeamMemberWorkload;
  highWeeks: number;
  repeatedDrivers: number;
  spareRoleCapacity: boolean;
}) {
  const { pattern, dominant, member, highWeeks, repeatedDrivers, spareRoleCapacity } = params;

  if (pattern === "PERSISTENT_HIGH") {
    if (member.responsibilityAreas >= 6) {
      return {
        type: "ROLE_REBALANCE" as const,
        label: "Vurder rolle-/ansvarsfordeling",
        rationale: `${member.displayName} har ${member.responsibilityAreas} faste ansvarsområder og høy belastning i ${highWeeks} av de neste fire ukene. Flytting av enkeltsaker løser trolig ikke grunnbelastningen.`,
        confidence: "high" as const,
      };
    }
    if ((dominant === "CAMPAIGN" || dominant === "FOLLOW_UP" || dominant === "TASK") && repeatedDrivers >= 5) {
      return {
        type: "AUTOMATE" as const,
        label: "Vurder automatisering",
        rationale: `Vedvarende press drives hovedsakelig av gjentakende ${dominant === "CAMPAIGN" ? "kampanje-/innholdsarbeid" : dominant === "FOLLOW_UP" ? "oppfølging" : "oppgaver"}. Dette er en kandidat for menneskelig vurdering av automatisering, ikke automatisk endring.`,
        confidence: "medium" as const,
      };
    }
    if (!spareRoleCapacity) {
      return {
        type: "STAFFING_REVIEW" as const,
        label: "Vurder bemanningsbehov",
        rationale: `Samme rolle mangler tydelig ledig kapasitet samtidig som belastningen er høy i ${highWeeks} uker. Det kan være et bemanningssignal, men krever menneskelig vurdering av etterspørsel og varighet.`,
        confidence: "medium" as const,
      };
    }
    return {
      type: "REDISTRIBUTE" as const,
      label: "Fordel arbeid tidligere",
      rationale: "Det finnes ledig kapasitet i samme rolle. Omfordeling før toppene oppstår er mest nærliggende tiltak.",
      confidence: "high" as const,
    };
  }

  if (pattern === "RISING") {
    return {
      type: spareRoleCapacity ? "REDISTRIBUTE" as const : "MONITOR" as const,
      label: spareRoleCapacity ? "Fordel kommende arbeid" : "Følg utviklingen",
      rationale: spareRoleCapacity
        ? "Belastningen stiger uke for uke, og samme rolle har lavere belastet kapasitet som kan brukes før terskelen nås."
        : "Belastningen stiger, men det finnes foreløpig ikke en tydelig trygg mottaker i samme rolle.",
      confidence: "medium" as const,
    };
  }

  if (pattern === "SPIKE") {
    return {
      type: spareRoleCapacity ? "REDISTRIBUTE" as const : "MONITOR" as const,
      label: spareRoleCapacity ? "Jevn ut enkeltuken" : "Overvåk toppen",
      rationale: "Belastningen ser ut som en tidsavgrenset topp, ikke et vedvarende kapasitetsproblem.",
      confidence: "medium" as const,
    };
  }

  return {
    type: "MONITOR" as const,
    label: "Ingen strukturell endring nå",
    rationale: "30-dagersbildet viser ikke et stabilt mønster som tilsier rolle-, bemannings- eller automasjonsendring.",
    confidence: "high" as const,
  };
}

export function buildTeamCapacityTrend(
  team: TeamWorkloadWorkspace,
  options: { now?: Date; horizonDays?: number } = {},
): TeamCapacityTrend {
  const now = options.now || new Date();
  const horizonDays = Math.max(21, Math.min(30, options.horizonDays ?? 30));
  const weekCount = 4;

  const members = team.members.map(member => {
    const baseline = member.responsibilityAreas * 30;
    const weeks: TeamCapacityTrendWeek[] = [];

    for (let index = 0; index < weekCount; index += 1) {
      const { start, end } = weekBounds(now, index, horizonDays);
      const kinds = emptyKinds();
      let score = baseline;
      let driverCount = 0;

      for (const item of team.items) {
        if (item.ownerEmail !== member.email || item.overdue) continue;
        const due = parseDate(item.dueDate);
        const scheduled = Boolean(due && due.getTime() >= start.getTime() && due.getTime() < end.getTime());
        const undatedPipeline =
          index === 0 &&
          !item.dueDate &&
          item.resourceType === "CONTACT" &&
          (item.stage === "VIEWING" || item.stage === "NEGOTIATION" || item.stage === "WON");
        if (!scheduled && !undatedPipeline) continue;

        const itemKind = scheduled ? kind(item) : "PIPELINE";
        kinds[itemKind] += 1;
        score += contribution(item, scheduled);
        driverCount += 1;
      }

      weeks.push({
        index,
        start: start.toISOString(),
        end: end.toISOString(),
        score,
        load: load(score, member.responsibilityAreas),
        driverCount,
        kinds,
      });
    }

    const scores = weeks.map(week => week.score);
    const highWeeks = weeks.filter(week => week.load === "HIGH").length;
    const risingWeeks = risingCount(scores);
    const highest = Math.max(...scores);
    const otherScores = scores.filter(score => score !== highest);
    const otherAverage = otherScores.length ? otherScores.reduce((sum, score) => sum + score, 0) / otherScores.length : 0;

    const pattern: TeamCapacityTrendPattern =
      highWeeks >= 3 ? "PERSISTENT_HIGH" :
      risingWeeks >= 2 && scores[scores.length - 1] >= TEAM_CAPACITY_BALANCED_THRESHOLD ? "RISING" :
      highWeeks === 1 && highest >= otherAverage + 120 ? "SPIKE" :
      "STABLE";

    const dominant = dominantKind(weeks);
    const repeatedDrivers = weeks.reduce((sum, week) => sum + week.driverCount, 0);
    const recommendation = interventionFor({
      pattern,
      dominant,
      member,
      highWeeks,
      repeatedDrivers,
      spareRoleCapacity: hasSpareRoleCapacity(team, member),
    });

    return {
      email: member.email,
      displayName: member.displayName,
      role: member.role,
      responsibilityAreas: member.responsibilityAreas,
      currentCapacityScore: member.capacityScore,
      pattern,
      highWeeks,
      risingWeeks,
      dominantKind: dominant,
      intervention: recommendation.type,
      interventionLabel: recommendation.label,
      rationale: recommendation.rationale,
      confidence: recommendation.confidence,
      weeks,
    };
  }).sort((a, b) =>
    Number(b.pattern === "PERSISTENT_HIGH") - Number(a.pattern === "PERSISTENT_HIGH") ||
    b.highWeeks - a.highWeeks ||
    b.weeks[b.weeks.length - 1].score - a.weeks[a.weeks.length - 1].score);

  const attentionMembers = members.filter(member => member.pattern !== "STABLE");
  return {
    generatedAt: now.toISOString(),
    horizonDays,
    members,
    attentionMembers,
    summary: {
      persistentHigh: members.filter(member => member.pattern === "PERSISTENT_HIGH").length,
      rising: members.filter(member => member.pattern === "RISING").length,
      spike: members.filter(member => member.pattern === "SPIKE").length,
      automationCandidates: members.filter(member => member.intervention === "AUTOMATE").length,
      staffingReviewCandidates: members.filter(member => member.intervention === "STAFFING_REVIEW").length,
      roleRebalanceCandidates: members.filter(member => member.intervention === "ROLE_REBALANCE").length,
    },
  };
}
