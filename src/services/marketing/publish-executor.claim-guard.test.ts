import assert from "node:assert/strict";
import test from "node:test";
import { makeMarketingPublishExecutor } from "@/services/marketing/publish-executor";

function makeReadDb() {
  const tables: Record<string, any[]> = {
    marketing_publications: [{
      publication_id: "pub_stale",
      content_id: "content_stale",
      brand_id: "zeneco",
      source_type: "generated",
      account_id: "17841472943966484",
      idempotency_key: "idem_stale",
      campaign_id: "camp_stale",
      marketing_run_id: "mrun_stale",
      asset_hash: null,
    }],
    marketing_assets: [{
      content_id: "content_stale",
      creative_variant_id: "content_stale_v1",
      campaign_id: "camp_stale",
      channel: "instagram",
      genome: {
        brandId: "zeneco",
        channel: "instagram",
        format: "post",
        hookType: "story",
        ctaType: "book_viewing",
        goal: "leads",
      },
      headline: "Drømmen om Costa Blanca – uten snarveier",
      body: "Forestill deg en hverdag med sol året rundt. Flere nordmenn ser i dag mot Costa Blanca. Ingen skjulte overraskelser, ingen språkbarrierer.",
      cta: "Book gratis boligsamtale",
      fact_sources: [],
      provenance: { generatedBy: "creative-generator", propertyIds: [] },
    }],
    brand_context: [{
      brand_id: "zeneco",
      brand_name: "Zen Eco Homes",
      voice: "profesjonell",
      audience: "norske kjøpere",
      languages: ["no"],
      markets: ["Costa Blanca"],
      services: ["Første boligsamtale Spania"],
      value_proposition: "Norsk partner i Spania",
      allowed_claims: [],
      forbidden_claims: [],
      preferred_cta: "Book gratis boligsamtale",
      visual_direction: "",
      locations: ["Costa Blanca"],
      urls: [],
      contact: {},
    }],
  };

  return {
    from(name: string) {
      const filters: Array<[string, unknown]> = [];
      let updatePayload: Record<string, unknown> | null = null;
      const matches = (r: any) => filters.every(([c, v]) => r[c] === v);
      const api: any = {
        select: () => api,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return api; },
        maybeSingle: async () => ({ data: (tables[name] ?? []).find(matches) ?? null, error: null }),
        update: (p: Record<string, unknown>) => { updatePayload = p; return api; },
        then: (resolve: any, reject: any) => Promise.resolve().then(() => {
          if (updatePayload) {
            for (const row of tables[name] ?? []) if (matches(row)) Object.assign(row, updatePayload);
          }
          return { data: null, error: null };
        }).then(resolve, reject),
      };
      return api;
    },
    tables,
  } as any;
}

test("publish executor: stale approved AI-caption revalidates current claim guard before Meta", async () => {
  const db = makeReadDb();
  let publishCalls = 0;
  const exec = makeMarketingPublishExecutor({
    supabase: db,
    publisher: {
      publish: async () => {
        publishCalls += 1;
        return { state: "published" as const, externalId: "should-not-happen" };
      },
    },
  });

  await assert.rejects(
    () => exec({ subjectRef: "pub_stale", correlationId: "rf_stale", runId: "mrun_stale" } as any),
    /CLAIM_NOT_VERIFIED/,
  );
  assert.equal(publishCalls, 0, "Meta publisher skal ikke kalles for stale approval som bryter dagens claim-gate");
});
