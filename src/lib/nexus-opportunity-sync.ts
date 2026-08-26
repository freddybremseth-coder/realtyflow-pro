import type { NexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";
import { revenuePrioritiesToRealEstateOpportunities } from "@/lib/nexus-opportunity-adapters";
import {
  bookGrowthPrioritiesToPublishingOpportunities,
  type BookGrowthPriorityInput,
} from "@/lib/nexus-publishing-opportunity-adapter";
import {
  demoSiteOrdersToAiOpportunities,
  type DemoSiteEventInput,
  type DemoSiteOrderInput,
} from "@/lib/nexus-ai-demosites-adapter";
import type { RevenuePriorityItem } from "@/lib/revenue/today";

export type NexusOpportunitySyncSource = "real_estate" | "publishing" | "ai_demosites";

export interface OpportunitySourcePayloads {
  revenue?: { priorities?: RevenuePriorityItem[] } | null;
  books?: { priority?: BookGrowthPriorityInput[] } | null;
  demosites?: { orders?: DemoSiteOrderInput[]; events?: DemoSiteEventInput[] } | null;
}

export interface NormalizedOpportunityBatch {
  source: NexusOpportunitySyncSource;
  fetched: number;
  opportunities: NexusBusinessOpportunity[];
}

export function normalizeOpportunitySourcePayloads(payloads: OpportunitySourcePayloads): NormalizedOpportunityBatch[] {
  const revenueRows = payloads.revenue?.priorities ?? [];
  const bookRows = payloads.books?.priority ?? [];
  const demoOrders = payloads.demosites?.orders ?? [];
  const demoEvents = payloads.demosites?.events ?? [];

  return [
    {
      source: "real_estate",
      fetched: revenueRows.length,
      opportunities: revenuePrioritiesToRealEstateOpportunities(revenueRows),
    },
    {
      source: "publishing",
      fetched: bookRows.length,
      opportunities: bookGrowthPrioritiesToPublishingOpportunities(bookRows),
    },
    {
      source: "ai_demosites",
      fetched: demoOrders.length,
      opportunities: demoSiteOrdersToAiOpportunities(demoOrders, demoEvents),
    },
  ];
}

export function contactIdForOpportunity(opportunity: NexusBusinessOpportunity) {
  if (opportunity.sourceSystem !== "revenue_today") return null;
  const candidate = opportunity.sourceId || "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}
