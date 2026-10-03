import {
  TEAM_CAPACITY_BALANCED_THRESHOLD,
  TEAM_CAPACITY_HIGH_THRESHOLD,
  type TeamMemberWorkload,
  type TeamWorkloadItem,
  type TeamWorkloadWorkspace,
} from "./team-workload";

export type TeamCapacityForecastDriver = {
  itemId: string;
  title: string;
  dueDate: string | null;
  kind: "FOLLOW_UP" | "VIEWING" | "CLOSING" | "CAMPAIGN" | "TASK" | "PIPELINE";
  contribution: number;
};

export type TeamCapacityForecastMember = {
  email: string;
  displayName: string;
  role: TeamMemberWorkload["role"];
  currentCapacityScore: number;
  currentLoad: TeamMemberWorkload["load"];
  responsibilityAreas: number;
  forecastScore: number;
  forecastLoad: TeamMemberWorkload["load"];
  delta: number;
  risk: "RISING_HIGH" | "STAYS_HIGH" | "BALANCED" | "LIGHT";
  drivers: TeamCapacityForecastDriver[];
};

export type TeamCapacityForecastSuggestion = {
  id: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName: string;
  itemId: string;
  resourceType: TeamWorkloadItem["resourceType"];
  resourceId: string;
  itemTitle: string;
  dueDate: string | null;
  brandId: string;
  forecastBefore: number;
  forecastAfter: number;
  targetForecastBefore: number;
  targetForecastAfter: number;
  reason: string;
  safety: string;
};

export type TeamCapacityForecast = {
  generatedAt: string;
  horizonEnd: string;
  horizonDays: number;
  members: TeamCapacityForecastMember[];
  riskMembers: TeamCapacityForecastMember[];
  suggestions: TeamCapacityForecastSuggestion[];
  summary: {
    risingHigh: number;
    staysHigh: number;
    forecastHigh: number;
    suggestions: number;
  };
};

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function futureWithin(item: TeamWorkloadItem, now: Date, end: Date) {
  const due = parseDate(item.dueDate);
  return Boolean(due && due.getTime() >= now.getTime() && due.getTime() <= end.getTime());
}

function driverKind(item: TeamWorkloadItem): TeamCapacityForecastDriver["kind"] {
  const text = `${item.title} ${item.detail}`.toLowerCase();
  if (item.stage === "VIEWING" || /visning|viewing/.test(text)) return "VIEWING";
  if (item.stage === "NEGOTIATION" || item.stage === "WON" || /closing|notary|reservation|overtak/.test(text)) return "CLOSING";
  if (item.resourceType === "CONTACT") return "FOLLOW_UP";
  if (/campaign|kampanje|marketing|utm|newsletter|nyhetsbrev|content/.test(text)) return "CAMPAIGN";
  return "TASK";
}

function forecastContribution(item: TeamWorkloadItem, scheduled: boolean) {
  let contribution = scheduled ? item.score : Math.round(item.score * 0.35);
  if (item.stage === "VIEWING") contribution += 15;
  if (item.stage === "NEGOTIATION") contribution += 25;
  if (item.stage === "WON") contribution += 15;
  if (item.resourceType === "TASK" && item.recommendedRoles.includes("MARKETING")) contribution += 10;
  return Math.min(120, contribution);
}

function loadFromForecast(score: number, responsibilityAreas: number): TeamMemberWorkload["load"] {
  if (score === 0 && responsibilityAreas === 0) return "EMPTY";
  if (score >= TEAM_CAPACITY_HIGH_THRESHOLD || responsibilityAreas >= 6) return "HIGH";
  if (score >= TEAM_CAPACITY_BALANCED_THRESHOLD || responsibilityAreas >= 3) return "BALANCED";
  return "LIGHT";
}

function forecastDrivers(team: TeamWorkloadWorkspace, member: TeamMemberWorkload, now: Date, end: Date) {
  return team.items.flatMap(item => {
    if (item.ownerEmail !== member.email || item.overdue) return [];
    const scheduled = futureWithin(item, now, end);
    const activePipelineWithoutDate =
      !item.dueDate &&
      item.resourceType === "CONTACT" &&
      (item.stage === "VIEWING" || item.stage === "NEGOTIATION" || item.stage === "WON");
    if (!scheduled && !activePipelineWithoutDate) return [];
    return [{
      itemId: item.id,
      title: item.title,
      dueDate: item.dueDate,
      kind: scheduled ? driverKind(item) : "PIPELINE" as const,
      contribution: forecastContribution(item, scheduled),
    }];
  }).sort((a, b) => b.contribution - a.contribution || a.title.localeCompare(b.title));
}

function safeForecastMove(item: TeamWorkloadItem, now: Date, end: Date) {
  if (item.overdue || item.priority === "CRITICAL") return false;
  if (item.stage === "NEGOTIATION" || item.stage === "WON") return false;
  if (!futureWithin(item, now, end)) return false;
  return true;
}

function roleEligible(item: TeamWorkloadItem, member: TeamMemberWorkload) {
  return member.isOwner || item.recommendedRoles.includes(member.role);
}

function specialistRank(member: TeamMemberWorkload, forecastScore: number) {
  const ownerPenalty = member.isOwner ? 120 : 0;
  const currentPenalty = member.load === "HIGH" ? 300 : member.load === "BALANCED" ? 70 : member.load === "LIGHT" ? 20 : 0;
  return forecastScore + ownerPenalty + currentPenalty + member.overdue * 30 + member.critical * 60;
}

export function buildTeamCapacityForecast(
  team: TeamWorkloadWorkspace,
  options: { now?: Date; horizonDays?: number; limitPerMember?: number } = {},
): TeamCapacityForecast {
  const now = options.now || new Date();
  const horizonDays = Math.max(1, Math.min(30, options.horizonDays ?? 7));
  const end = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  const members = team.members.map(member => {
    const drivers = forecastDrivers(team, member, now, end);
    const baseline = member.responsibilityAreas * 30;
    const forecastScore = baseline + drivers.reduce((sum, driver) => sum + driver.contribution, 0);
    const forecastLoad = loadFromForecast(forecastScore, member.responsibilityAreas);
    const risk: TeamCapacityForecastMember["risk"] =
      forecastLoad === "HIGH" && member.load !== "HIGH" ? "RISING_HIGH" :
      forecastLoad === "HIGH" ? "STAYS_HIGH" :
      forecastLoad === "BALANCED" ? "BALANCED" : "LIGHT";

    return {
      email: member.email,
      displayName: member.displayName,
      role: member.role,
      currentCapacityScore: member.capacityScore,
      currentLoad: member.load,
      responsibilityAreas: member.responsibilityAreas,
      forecastScore,
      forecastLoad,
      delta: forecastScore - member.capacityScore,
      risk,
      drivers,
    };
  }).sort((a, b) => b.forecastScore - a.forecastScore || a.displayName.localeCompare(b.displayName));

  const memberByEmail = new Map(team.members.map(member => [member.email, member]));
  const forecastByEmail = new Map(members.map(member => [member.email, member.forecastScore]));
  const projected = new Map(forecastByEmail);
  const suggestions: TeamCapacityForecastSuggestion[] = [];
  const limitPerMember = options.limitPerMember ?? 2;

  for (const source of members.filter(member => member.forecastLoad === "HIGH")) {
    const sourceMember = memberByEmail.get(source.email);
    if (!sourceMember) continue;
    let sourceProjected = projected.get(source.email) ?? source.forecastScore;
    const candidates = team.items
      .filter(item => item.ownerEmail === source.email && safeForecastMove(item, now, end))
      .sort((a, b) =>
        Number(a.resourceType === "CONTACT") - Number(b.resourceType === "CONTACT") ||
        a.score - b.score ||
        a.title.localeCompare(b.title));

    let count = 0;
    for (const item of candidates) {
      if (count >= limitPerMember || sourceProjected < TEAM_CAPACITY_HIGH_THRESHOLD) break;
      const driver = source.drivers.find(row => row.itemId === item.id);
      const contribution = driver?.contribution || forecastContribution(item, true);

      const targets = team.members
        .filter(member =>
          member.email !== source.email &&
          member.load !== "HIGH" &&
          roleEligible(item, member))
        .sort((a, b) => {
          const aForecast = projected.get(a.email) ?? forecastByEmail.get(a.email) ?? a.capacityScore;
          const bForecast = projected.get(b.email) ?? forecastByEmail.get(b.email) ?? b.capacityScore;
          return specialistRank(a, aForecast) - specialistRank(b, bForecast) || a.displayName.localeCompare(b.displayName);
        });

      const target = targets.find(member => {
        const before = projected.get(member.email) ?? forecastByEmail.get(member.email) ?? member.capacityScore;
        return before + contribution < TEAM_CAPACITY_HIGH_THRESHOLD;
      });
      if (!target) continue;

      const targetBefore = projected.get(target.email) ?? forecastByEmail.get(target.email) ?? target.capacityScore;
      const sourceBefore = sourceProjected;
      sourceProjected = Math.max(sourceMember.responsibilityAreas * 30, sourceProjected - contribution);
      const targetAfter = targetBefore + contribution;
      projected.set(source.email, sourceProjected);
      projected.set(target.email, targetAfter);

      suggestions.push({
        id: `forecast:${source.email}:${item.id}:${target.email}`,
        fromEmail: source.email,
        fromName: source.displayName,
        toEmail: target.email,
        toName: target.displayName,
        itemId: item.id,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        itemTitle: item.title,
        dueDate: item.dueDate,
        brandId: item.brandId,
        forecastBefore: sourceBefore,
        forecastAfter: sourceProjected,
        targetForecastBefore: targetBefore,
        targetForecastAfter: targetAfter,
        reason: `${source.displayName} er prognostisert til høy belastning de neste ${horizonDays} dagene. ${target.displayName} har lavere prognostisert belastning og riktig rolle for saken.`,
        safety: "Prognosen foreslår ikke kritiske, forfalte, NEGOTIATION- eller WON-saker. Flytting krever alltid Owner-godkjenning.",
      });
      count += 1;
    }
  }

  const riskMembers = members.filter(member => member.risk === "RISING_HIGH" || member.risk === "STAYS_HIGH");
  return {
    generatedAt: now.toISOString(),
    horizonEnd: end.toISOString(),
    horizonDays,
    members,
    riskMembers,
    suggestions,
    summary: {
      risingHigh: members.filter(member => member.risk === "RISING_HIGH").length,
      staysHigh: members.filter(member => member.risk === "STAYS_HIGH").length,
      forecastHigh: members.filter(member => member.forecastLoad === "HIGH").length,
      suggestions: suggestions.length,
    },
  };
}
