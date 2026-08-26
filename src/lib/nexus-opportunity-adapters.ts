import { buildNexusBusinessOpportunity, type NexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";
import type { RevenuePriorityItem } from "@/lib/revenue/today";

const REAL_ESTATE_STAGE_MAP: Record<string, string> = {
  NEW: "new_lead",
  CONTACT: "new_lead",
  QUALIFIED: "qualified_buyer",
  VIEWING: "viewing",
  NEGOTIATION: "negotiation",
  ON_HOLD: "qualified_buyer",
};

export function revenuePriorityToRealEstateOpportunity(item: RevenuePriorityItem): NexusBusinessOpportunity | null {
  const stageId = REAL_ESTATE_STAGE_MAP[String(item.stage || "NEW").trim().toUpperCase()] || "new_lead";
  return buildNexusBusinessOpportunity({
    id: `revenue:${item.id}`,
    brandId: item.brandId || "real_estate",
    offerId: item.propertyInterest || null,
    pipelineId: "real_estate_sales",
    stageId,
    title: item.contactName || "Eiendomslead",
    reason: item.reason,
    nextAction: item.recommendedAction,
    priority: item.priority,
    priorityScore: item.score,
    value: item.value,
    currency: "EUR",
    sourceSystem: "revenue_today",
    sourceId: item.id,
    href: item.href,
    routeConfidence: "high",
    routeReason: "Eksisterende Revenue Today er en eksplisitt eiendomspipeline.",
    updatedAt: item.lastContactAt || item.createdAt,
  });
}

export function revenuePrioritiesToRealEstateOpportunities(items: RevenuePriorityItem[]) {
  return items.map(revenuePriorityToRealEstateOpportunity).filter((item): item is NexusBusinessOpportunity => Boolean(item));
}
