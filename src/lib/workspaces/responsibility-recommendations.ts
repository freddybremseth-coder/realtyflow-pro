import { WORKSPACE_ACCESS_PRESETS, workspaceAccessPresetChoice, type WorkspaceAccessPresetId } from "./access-presets";
import { programPermissions } from "./module-catalog";
import { responsibilityAllowed, suggestedResponsibilitiesForPreset, type WorkspaceResponsibilityId } from "./responsibilities";
import type { WorkspacePermission } from "./brand-policy";
import type { WorkspaceTeamUser } from "./team-responsibility-overview";

export type ResponsibilityWorkload = {
  email: string;
  totalScore: number;
  load: "HIGH" | "BALANCED" | "LIGHT" | "EMPTY";
  contacts: number;
  tasks: number;
  overdue: number;
  critical: number;
};

export type WorkspaceResponsibilityRecommendation = {
  userId: string;
  displayName: string;
  email: string | null;
  accountKind: "staff" | "external";
  score: number;
  confidence: "high" | "medium" | "low";
  bestPresetId: WorkspaceAccessPresetId | null;
  bestPresetLabel: string | null;
  responsibilityCount: number;
  workload: ResponsibilityWorkload | null;
  reasons: string[];
};

function presetPermissions(brandKey: string, presetId: WorkspaceAccessPresetId): WorkspacePermission[] {
  const choice = workspaceAccessPresetChoice(brandKey, presetId);
  return programPermissions({
    brandKey,
    crmRead: choice.crmRead,
    crmWrite: choice.crmWrite,
    properties: choice.properties,
    jointTasksRead: choice.tasksRead,
    jointTasksWrite: choice.tasksWrite,
    marketingRead: choice.marketingRead,
    marketingDraft: choice.marketingDraft,
    marketingPublish: choice.marketingPublish,
    reelsRead: choice.reelsRead,
    reelsCreate: choice.reelsCreate,
    reelsPublish: choice.reelsPublish,
    youtubeRead: choice.youtubeRead,
    youtubePublish: choice.youtubePublish,
    nexusRead: choice.nexusRead,
    corporateRead: choice.corporateRead,
    corporatePlan: choice.corporatePlan,
    visibilityRead: choice.visibilityRead,
    visibilityPlan: choice.visibilityPlan,
    adsRead: choice.adsRead,
    adsDraft: choice.adsDraft,
    eventsPlan: choice.eventsPlan,
    contentRead: choice.contentRead,
    contentEdit: choice.contentEdit,
    contentPublish: choice.contentPublish,
    emailRead: choice.emailRead,
    emailDraft: choice.emailDraft,
    emailSend: choice.emailSend,
  });
}

function bestPresetFit(
  brandKey: string,
  responsibility: WorkspaceResponsibilityId,
  permissions: WorkspacePermission[],
) {
  let best: { id: WorkspaceAccessPresetId; label: string; score: number } | null = null;
  for (const preset of WORKSPACE_ACCESS_PRESETS) {
    const presetPermissionsList = presetPermissions(brandKey, preset.id);
    if (!suggestedResponsibilitiesForPreset(brandKey, preset.id, presetPermissionsList).includes(responsibility)) continue;
    const overlap = presetPermissionsList.filter(permission => permissions.includes(permission)).length;
    const fit = presetPermissionsList.length ? Math.round((overlap / presetPermissionsList.length) * 100) : 0;
    if (!best || fit > best.score) best = { id: preset.id, label: preset.label, score: fit };
  }
  return best;
}

function workloadAdjustment(workload: ResponsibilityWorkload | null) {
  if (!workload) return { score: 0, reason: "Belastning ikke tilgjengelig" };
  if (workload.load === "EMPTY") return { score: 20, reason: "Ingen aktiv kunde-/oppgavebelastning" };
  if (workload.load === "LIGHT") return { score: 15, reason: "Lav arbeidsbelastning" };
  if (workload.load === "BALANCED") return { score: 7, reason: "Balansert arbeidsbelastning" };
  return { score: -18, reason: "Høy arbeidsbelastning" };
}

export function recommendWorkspaceResponsibilityOwners(input: {
  brandKey: string;
  responsibility: WorkspaceResponsibilityId;
  users: WorkspaceTeamUser[];
  workloads?: ResponsibilityWorkload[];
  limit?: number;
}): WorkspaceResponsibilityRecommendation[] {
  const workloadByEmail = new Map(
    (input.workloads || []).map(item => [item.email.trim().toLowerCase(), item]),
  );

  const candidates = input.users.flatMap(user => {
    if (user.status !== "active" || user.expired) return [];
    const membership = user.memberships.find(item =>
      item.brandKey === input.brandKey && item.status === "active");
    if (!membership || !responsibilityAllowed(input.brandKey, input.responsibility, membership.permissions)) return [];

    const email = user.email?.trim().toLowerCase() || null;
    const workload = email ? workloadByEmail.get(email) || null : null;
    const preset = bestPresetFit(input.brandKey, input.responsibility, membership.permissions);
    const responsibilityCount = membership.responsibilities.length;

    let score = 45;
    const reasons = ["Har nødvendig tilgang"];

    if (preset) {
      const fitBonus = Math.round((preset.score / 100) * 28);
      score += fitBonus;
      reasons.push(`Matcher rollen ${preset.label}`);
    }

    const load = workloadAdjustment(workload);
    score += load.score;
    reasons.push(load.reason);

    const responsibilityPenalty = Math.min(24, responsibilityCount * 4);
    score -= responsibilityPenalty;
    if (responsibilityCount === 0) reasons.push("Har ingen andre personlige ansvarsområder");
    else if (responsibilityCount <= 2) reasons.push(`Har bare ${responsibilityCount} andre ansvarsområder`);
    else reasons.push(`Har allerede ${responsibilityCount} ansvarsområder`);

    if (workload?.overdue) score -= Math.min(12, workload.overdue * 3);
    if (workload?.critical) score -= Math.min(12, workload.critical * 4);

    const normalizedScore = Math.max(0, Math.min(100, score));
    return [{
      userId: user.userId,
      displayName: user.displayName,
      email,
      accountKind: user.accountKind,
      score: normalizedScore,
      confidence: normalizedScore >= 75 ? "high" as const : normalizedScore >= 55 ? "medium" as const : "low" as const,
      bestPresetId: preset?.id || null,
      bestPresetLabel: preset?.label || null,
      responsibilityCount,
      workload,
      reasons: reasons.slice(0, 4),
    }];
  });

  return candidates
    .sort((a, b) =>
      b.score - a.score ||
      a.responsibilityCount - b.responsibilityCount ||
      a.displayName.localeCompare(b.displayName))
    .slice(0, input.limit ?? 3);
}
