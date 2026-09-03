import type { SupabaseClient } from "@supabase/supabase-js";
import { loadNexusRevenueCommandSnapshot } from "@/lib/nexus-command-readers";

export interface NexusMentorMission {
  id: string;
  title: string;
  nextAction: string;
  whyNow: string;
  priority: string;
  priorityScore: number;
  dueInHours: number;
  expectedValue: number | null;
  currency: string | null;
  autonomy: string;
  brandId: string;
  pipelineId: string;
}

export interface NexusBusinessMentorSummary {
  source: "nexus_revenue_command_center";
  generatedAt: string;
  activeOpportunities: number;
  criticalPipelines: number;
  atRiskPipelines: number;
  staleConversionOpportunities: number;
  approvalOrHumanRequired: number;
  topMissions: NexusMentorMission[];
  syncHealth: unknown;
  warnings: string[];
  safety: {
    readOnly: true;
    persistAsPersonalMemory: false;
    outboundActions: false;
  };
}

export async function loadNexusBusinessMentorSummary(
  supabase: SupabaseClient,
): Promise<NexusBusinessMentorSummary> {
  const snapshot = await loadNexusRevenueCommandSnapshot(supabase);
  const summary = snapshot.summary || {};
  const missions = Array.isArray(snapshot.growthMissions) ? snapshot.growthMissions : [];

  return {
    source: "nexus_revenue_command_center",
    generatedAt: String(snapshot.generatedAt || new Date().toISOString()),
    activeOpportunities: Number(summary.activeOpportunities || 0),
    criticalPipelines: Number(summary.criticalPipelines || 0),
    atRiskPipelines: Number(summary.atRiskPipelines || 0),
    staleConversionOpportunities: Number(summary.staleConversionOpportunities || 0),
    approvalOrHumanRequired: Number(summary.approvalOrHumanRequired || 0),
    topMissions: missions.slice(0, 5).map((mission) => ({
      id: String(mission.id),
      title: String(mission.title),
      nextAction: String(mission.nextAction),
      whyNow: String(mission.whyNow),
      priority: String(mission.priority),
      priorityScore: Number(mission.priorityScore || 0),
      dueInHours: Number(mission.dueInHours || 72),
      expectedValue: mission.expectedValue === null ? null : Number(mission.expectedValue || 0),
      currency: mission.currency ? String(mission.currency) : null,
      autonomy: String(mission.autonomy),
      brandId: String(mission.brandId),
      pipelineId: String(mission.pipelineId),
    })),
    syncHealth: snapshot.syncHealth || null,
    warnings: Array.isArray(snapshot.warnings) ? snapshot.warnings.map(String) : [],
    safety: {
      readOnly: true,
      persistAsPersonalMemory: false,
      outboundActions: false,
    },
  };
}
