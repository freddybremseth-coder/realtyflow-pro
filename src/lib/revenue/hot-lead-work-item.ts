export type HotLeadSlaReadModel = {
  hotLead: boolean;
  responseDueAt: string | null;
  responseSlaMinutes: number | null;
  operationalTarget: string | null;
  stageReadinessHref: string | null;
  buyerProfileId: string | null;
  isSlaOverdue: boolean;
};

function text(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function readHotLeadSla(metadata: unknown, now = new Date()): HotLeadSlaReadModel {
  const value = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const hotLead = value.hot_lead === true;
  const responseDueAt = text(value.response_due_at);
  const dueMs = responseDueAt ? new Date(responseDueAt).getTime() : Number.NaN;

  return {
    hotLead,
    responseDueAt,
    responseSlaMinutes: positiveNumber(value.response_sla_minutes),
    operationalTarget: text(value.operational_target),
    stageReadinessHref: text(value.stage_readiness_href || value.buyer_profile_href),
    buyerProfileId: text(value.buyer_profile_id),
    isSlaOverdue: hotLead && Number.isFinite(dueMs) && dueMs < now.getTime(),
  };
}
