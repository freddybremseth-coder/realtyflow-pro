import test from "node:test";
import assert from "node:assert/strict";
import { persistAsset } from "./creative-generator";

function fakeSupabase() {
  const calls: Array<{ table: string; payload: any; options: any }> = [];
  return {
    calls,
    from(table: string) {
      return {
        async upsert(payload: any, options: any) {
          calls.push({ table, payload, options });
          return { error: null };
        },
      };
    },
  };
}

test("persistAsset writes marketing_assets and canonical marketing_content", async () => {
  const supabase = fakeSupabase();
  const genome = {
    brandId: "zeneco",
    channel: "instagram",
    format: "post",
    goal: "lead_generation",
    hookType: "price_first",
    ctaType: "book_viewing",
  } as any;

  await persistAsset(supabase as any, {
    asset: {
      contentId: "content_1",
      creativeVariantId: "content_1_v1",
      campaignId: "campaign_1",
      channel: "instagram",
      genome,
      headline: "Test",
      body: "Grounded copy",
      cta: "Book gratis boligsamtale",
      factSources: [{ claim: "Pris: €500000", source: "Inventory property:1" }],
      generator: {},
    },
    provenance: {
      generatedBy: "test",
      model: "test",
      promptVersion: "test-1",
      learningRulesUsed: [],
      factSources: [{ claim: "Pris: €500000", source: "Inventory property:1" }],
      propertyIds: ["property_1"],
      createdAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
    },
  } as any);

  assert.equal(supabase.calls.length, 2);
  assert.equal(supabase.calls[0].table, "marketing_assets");
  assert.equal(supabase.calls[1].table, "marketing_content");
  assert.equal(supabase.calls[1].payload.content_id, "content_1");
  assert.equal(supabase.calls[1].payload.brand_id, "zeneco");
  assert.equal(supabase.calls[1].payload.channel, "instagram");
  assert.equal(supabase.calls[1].payload.format, "post");
  assert.deepEqual(supabase.calls[1].payload.genome, genome);
});

test("persistAsset fails closed when genome.brandId is missing", async () => {
  const supabase = fakeSupabase();
  await assert.rejects(
    persistAsset(supabase as any, {
      asset: {
        contentId: "content_2",
        creativeVariantId: "content_2_v1",
        campaignId: "campaign_1",
        channel: "instagram",
        genome: { channel: "instagram", format: "post" },
        body: "Copy",
        factSources: [],
        generator: {},
      },
      provenance: {
        generatedBy: "test",
        promptVersion: "test-1",
        learningRulesUsed: [],
        factSources: [],
        propertyIds: [],
        createdAt: new Date().toISOString(),
        approvedBy: null,
        approvedAt: null,
      },
    } as any),
    /genome\.brandId mangler/,
  );
  assert.equal(supabase.calls[0].table, "marketing_assets");
});
