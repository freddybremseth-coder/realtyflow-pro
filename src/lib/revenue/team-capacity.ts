import { TEAM_CAPACITY_HIGH_THRESHOLD, type TeamMemberWorkload, type TeamWorkloadItem, type TeamWorkloadWorkspace } from "./team-workload";

export type TeamCapacitySuggestion = {
  id: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName: string;
  itemId: string;
  resourceType: TeamWorkloadItem["resourceType"];
  resourceId: string;
  itemTitle: string;
  brandId: string;
  itemScore: number;
  sourceCapacityBefore: number;
  sourceCapacityAfter: number;
  targetCapacityBefore: number;
  targetCapacityAfter: number;
  reason: string;
  safety: string;
};

export function responsibilityLoadByEmail(params: {
  users?: Array<Record<string, unknown>>;
  memberships?: Array<Record<string, unknown>>;
  responsibilities?: Array<Record<string, unknown>>;
  now?: Date;
}) {
  const now = params.now || new Date();
  const activeEmails = new Map<string, string>();
  for (const row of params.users || []) {
    const userId = String(row.user_id || "").trim();
    const email = String(row.email || "").trim().toLowerCase();
    const status = String(row.status || "").trim().toLowerCase();
    const expiresAt = row.access_expires_at ? new Date(String(row.access_expires_at)) : null;
    if (!userId || !email || status !== "active") continue;
    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()) continue;
    activeEmails.set(userId, email);
  }

  const activeMemberships = new Set(
    (params.memberships || [])
      .filter(row => String(row.status || "").toLowerCase() === "active")
      .map(row => `${String(row.user_id || "")}:${String(row.brand_id || "")}`),
  );

  const counts: Record<string, number> = {};
  for (const row of params.responsibilities || []) {
    const userId = String(row.user_id || "").trim();
    const brandId = String(row.brand_id || "").trim();
    const email = activeEmails.get(userId);
    if (!email || !activeMemberships.has(`${userId}:${brandId}`)) continue;
    const list = Array.isArray(row.responsibilities) ? row.responsibilities : [];
    counts[email] = (counts[email] || 0) + list.length;
  }
  return counts;
}

function safeToMove(item: TeamWorkloadItem) {
  if (item.overdue || item.priority === "CRITICAL") return false;
  if (item.stage === "NEGOTIATION" || item.stage === "WON") return false;
  return true;
}

function roleEligible(item: TeamWorkloadItem, member: TeamMemberWorkload) {
  return member.isOwner || item.recommendedRoles.includes(member.role);
}

function targetRank(member: TeamMemberWorkload) {
  const loadPenalty = member.load === "EMPTY" ? 0 : member.load === "LIGHT" ? 20 : member.load === "BALANCED" ? 80 : 300;
  const ownerFallbackPenalty = member.isOwner ? 120 : 0;
  return member.capacityScore + loadPenalty + member.overdue * 30 + member.critical * 60 + ownerFallbackPenalty;
}

export function buildTeamCapacitySuggestions(
  team: TeamWorkloadWorkspace,
  limitPerMember = 3,
): TeamCapacitySuggestion[] {
  const suggestions: TeamCapacitySuggestion[] = [];
  const projected = new Map(team.members.map(member => [member.email, member.capacityScore]));

  for (const source of team.members.filter(member => member.load === "HIGH")) {
    let sourceProjected = projected.get(source.email) ?? source.capacityScore;
    const owned = team.items
      .filter(item => item.ownerEmail === source.email && safeToMove(item))
      .sort((a, b) =>
        Number(a.resourceType === "CONTACT") - Number(b.resourceType === "CONTACT") ||
        a.score - b.score ||
        a.title.localeCompare(b.title));

    let memberSuggestions = 0;
    for (const item of owned) {
      if (memberSuggestions >= limitPerMember) break;
      if (sourceProjected < TEAM_CAPACITY_HIGH_THRESHOLD && source.contacts + source.tasks < 8 && source.responsibilityAreas < 6) break;

      const targets = team.members
        .filter(member =>
          member.email !== source.email &&
          member.load !== "HIGH" &&
          roleEligible(item, member))
        .sort((a, b) => {
          const aProjected = projected.get(a.email) ?? a.capacityScore;
          const bProjected = projected.get(b.email) ?? b.capacityScore;
          return (aProjected + targetRank(a)) - (bProjected + targetRank(b)) || a.displayName.localeCompare(b.displayName);
        });

      const target = targets.find(member => {
        const before = projected.get(member.email) ?? member.capacityScore;
        const after = before + item.score;
        return after < TEAM_CAPACITY_HIGH_THRESHOLD && member.contacts + member.tasks + 1 < 8;
      });
      if (!target) continue;

      const targetBefore = projected.get(target.email) ?? target.capacityScore;
      const sourceBefore = sourceProjected;
      sourceProjected = Math.max(0, sourceProjected - item.score);
      const targetAfter = targetBefore + item.score;
      projected.set(source.email, sourceProjected);
      projected.set(target.email, targetAfter);

      suggestions.push({
        id: `${source.email}:${item.id}:${target.email}`,
        fromEmail: source.email,
        fromName: source.displayName,
        toEmail: target.email,
        toName: target.displayName,
        itemId: item.id,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        itemTitle: item.title,
        brandId: item.brandId,
        itemScore: item.score,
        sourceCapacityBefore: sourceBefore,
        sourceCapacityAfter: sourceProjected,
        targetCapacityBefore: targetBefore,
        targetCapacityAfter: targetAfter,
        reason: `${source.displayName} har høy kapasitetsbelastning (${source.capacityScore}) mens ${target.displayName} har ${target.load === "EMPTY" ? "ledig" : target.load === "LIGHT" ? "lett" : "balansert"} belastning (${target.capacityScore}).`,
        safety: "Forslaget flytter ikke kritiske, forfalte, forhandlings- eller vunnet-saker og krever Owner-godkjenning.",
      });
      memberSuggestions += 1;
    }
  }

  return suggestions;
}
