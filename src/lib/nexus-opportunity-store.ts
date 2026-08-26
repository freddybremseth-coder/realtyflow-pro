import {
  buildNexusBusinessOpportunity,
  type NexusBusinessOpportunity,
} from "@/lib/nexus-business-opportunity";

export type NexusOpportunityState = "active" | "won" | "lost" | "archived";

export interface NexusOpportunityStoreContext {
  contactId?: string | null;
  state?: NexusOpportunityState;
  lastActivityAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface NexusOpportunityStoreRow {
  contact_id: string | null;
  brand_id: string;
  offer_id: string | null;
  pipeline_id: NexusBusinessOpportunity["pipelineId"];
  stage_id: string;
  lifecycle_phase: NexusBusinessOpportunity["phase"];
  opportunity_state: NexusOpportunityState;
  title: string;
  reason: string | null;
  next_action: string | null;
  priority: NexusBusinessOpportunity["priority"];
  priority_score: number;
  value: number | null;
  currency: string | null;
  route_confidence: NexusBusinessOpportunity["routeConfidence"];
  route_reason: string | null;
  source_system: string;
  source_id: string;
  source_updated_at: string | null;
  last_activity_at: string | null;
  metadata: Record<string, unknown>;
}

function fallbackHref(pipelineId: NexusBusinessOpportunity["pipelineId"]) {
  if (pipelineId === "real_estate_sales") return "/today";
  if (pipelineId === "publishing") return "/book-growth";
  if (pipelineId === "ai_products_services") return "/saas?tab=demosites";
  return "/nexus-os/business-pipelines";
}

export function opportunityToStoreRow(
  opportunity: NexusBusinessOpportunity,
  context: NexusOpportunityStoreContext = {},
): NexusOpportunityStoreRow {
  return {
    contact_id: context.contactId || null,
    brand_id: opportunity.brandId,
    offer_id: opportunity.offerId,
    pipeline_id: opportunity.pipelineId,
    stage_id: opportunity.stageId,
    lifecycle_phase: opportunity.phase,
    opportunity_state: context.state || (opportunity.terminal ? "won" : "active"),
    title: opportunity.title,
    reason: opportunity.reason,
    next_action: opportunity.nextAction,
    priority: opportunity.priority,
    priority_score: opportunity.priorityScore,
    value: opportunity.value,
    currency: opportunity.currency,
    route_confidence: opportunity.routeConfidence,
    route_reason: opportunity.routeReason,
    source_system: opportunity.sourceSystem,
    source_id: opportunity.sourceId || opportunity.id,
    source_updated_at: opportunity.updatedAt,
    last_activity_at: context.lastActivityAt ?? opportunity.updatedAt,
    metadata: {
      ...(context.metadata || {}),
      normalized_opportunity_id: opportunity.id,
      pipeline_name: opportunity.pipelineName,
      stage_label: opportunity.stageLabel,
      success_event: opportunity.successEvent,
      href: opportunity.href,
    },
  };
}

export function storeRowToOpportunity(row: NexusOpportunityStoreRow): NexusBusinessOpportunity | null {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const href = typeof metadata.href === "string" && metadata.href.trim()
    ? metadata.href
    : fallbackHref(row.pipeline_id);

  return buildNexusBusinessOpportunity({
    id: typeof metadata.normalized_opportunity_id === "string" && metadata.normalized_opportunity_id.trim()
      ? metadata.normalized_opportunity_id
      : `${row.source_system}:${row.source_id}`,
    brandId: row.brand_id,
    offerId: row.offer_id,
    pipelineId: row.pipeline_id,
    stageId: row.stage_id,
    title: row.title,
    reason: row.reason,
    nextAction: row.next_action,
    priority: row.priority,
    priorityScore: Number(row.priority_score || 0),
    value: row.value,
    currency: row.currency,
    sourceSystem: row.source_system,
    sourceId: row.source_id,
    href,
    routeConfidence: row.route_confidence,
    routeReason: row.route_reason,
    updatedAt: row.last_activity_at || row.source_updated_at,
  });
}

type SupabaseLike = {
  from(table: string): {
    upsert(values: unknown, options?: Record<string, unknown>): {
      select(columns?: string): {
        single(): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };
};

export async function upsertNexusOpportunitySnapshot(
  supabase: SupabaseLike,
  opportunity: NexusBusinessOpportunity,
  context: NexusOpportunityStoreContext = {},
) {
  const row = opportunityToStoreRow(opportunity, context);
  const result = await supabase
    .from("nexus_business_opportunities")
    .upsert(row, { onConflict: "source_system,source_id,pipeline_id" })
    .select("*")
    .single();

  if (result.error) {
    return { ok: false as const, error: result.error.message || "Could not upsert Nexus opportunity", row };
  }
  return { ok: true as const, data: result.data, row };
}
