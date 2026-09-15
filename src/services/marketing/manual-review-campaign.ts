import {
  createCampaignDraft,
  type CampaignDraftResult,
  type CreateCampaignDraftInput,
} from "@/services/marketing/campaign-production";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

/**
 * Invocation-scoped policy view for governed Nexus/chat actions.
 * The chat action may prepare drafts, but it never inherits controlled-auto
 * publication authority from the normal Growth OS plan.
 */
export function makeManualReviewMarketingSupabase(
  supabase: MarketingSupabaseLike,
): MarketingSupabaseLike {
  return {
    from(table: string) {
      if (table !== "marketing_brand_growth_plans") return supabase.from(table);

      // Supabase/PostgREST query builders return the next builder in the chain.
      // Keep forwarding that returned builder instead of assuming select()/eq()
      // mutate the original object in place.
      let query: any = supabase.from(table);
      const facade: any = {
        select(...args: any[]) {
          query = query.select(...args);
          return facade;
        },
        eq(...args: any[]) {
          query = query.eq(...args);
          return facade;
        },
        async maybeSingle() {
          const result = await query.maybeSingle();
          return {
            ...result,
            data: {
              ...(result?.data ?? {}),
              autonomy_mode: "copilot",
              metadata: {
                ...(result?.data?.metadata ?? {}),
                autopilot_channels: [],
                autopilot_scope: [],
              },
            },
          };
        },
      };
      return facade;
    },
  };
}

export async function createManualReviewCampaignDraft(
  supabase: MarketingSupabaseLike,
  input: CreateCampaignDraftInput,
  ctx: { marketingRunId?: string; correlationId?: string } = {},
): Promise<CampaignDraftResult> {
  return createCampaignDraft(makeManualReviewMarketingSupabase(supabase), input, ctx);
}
