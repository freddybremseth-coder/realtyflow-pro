/**
 * Marketing Growth OS — produksjonsadaptere (bak DI).
 * Persisterer content genome + marketing events, og speiler revenue-relevante
 * hendelser til revenue_events (nervesystemet). Byggetrygg generisk klient.
 */

import { insertRevenueEvent, type RevenueEventsSupabaseLike } from "@/lib/revenue/events";
import type { ContentGenome } from "@/lib/marketing/genome";
import { normalizeMarketingEvent, revenueEventForMarketing, type MarketingEventInput } from "@/lib/marketing/events";

export interface MarketingSupabaseLike {
  from(table: string): any;
}

export function makeMarketingStore(supabase: MarketingSupabaseLike) {
  return {
    /** Registrer/oppdater genome for en innholdsbit (Phase 2). */
    upsertContent: async (contentId: string, brandId: string, genome: ContentGenome) => {
      const { error } = await supabase.from("marketing_content").upsert(
        { content_id: contentId, brand_id: brandId, channel: genome.channel, format: genome.format, genome, updated_at: new Date().toISOString() },
        { onConflict: "content_id" },
      );
      if (error) throw new Error(`upsertContent failed: ${error.message}`);
      return { contentId };
    },

    /** Registrer en marketing-hendelse (Phase 1) + speil revenue-relevante til revenue_events. */
    recordEvent: async (input: MarketingEventInput) => {
      const payload = normalizeMarketingEvent(input);
      const { data, error } = await supabase.from("marketing_events").insert(payload).select("id").single();
      if (error) throw new Error(`recordEvent failed: ${error.message}`);

      const bridge = revenueEventForMarketing(input);
      let bridged = false;
      if (bridge) {
        try {
          await insertRevenueEvent(supabase as RevenueEventsSupabaseLike, bridge);
          bridged = true;
        } catch {
          /* revenue_events-speiling feiler stille; marketing_events er lagret */
        }
      }
      return { id: data ? String(data.id) : null, businessValue: payload.business_value, bridged };
    },
  };
}
