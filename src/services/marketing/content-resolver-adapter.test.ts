import assert from "node:assert/strict";
import test from "node:test";
import { resolvePublishingAccount } from "@/services/marketing/account-resolver";
import { resolveMarketingContent } from "@/services/marketing/content-resolver-adapter";

/** Filtrerende in-memory fake (eq/in), nok for resolver-spørringene. */
function makeDb(tables: Record<string, any[]>) {
  function make(name: string) {
    const filters: Array<[string, any]> = [];
    const ins: Array<[string, any[]]> = [];
    const rows = () => (tables[name] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v) && ins.every(([c, vs]) => vs.includes(r[c])));
    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      in: (c: string, vs: any[]) => { ins.push([c, vs]); return api; },
      limit: () => api,
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return api;
  }
  return { from: make } as any;
}

// ── 3: riktig publiseringskonto resolves (fail-closed ellers) ────────────────
test("3: riktig publiseringskonto (external_id) resolves for brand+kanal", async () => {
  const db = makeDb({ social_channels: [
    { brand_id: "b1", platform: "instagram", external_id: "IG_ACC_1", display_name: "Zen IG", is_active: true },
    { brand_id: "b2", platform: "instagram", external_id: "IG_ACC_2", display_name: "Soleada IG", is_active: true },
  ] });
  const acc = await resolvePublishingAccount(db, { brandId: "b1", channel: "instagram" });
  assert.equal(acc.accountId, "IG_ACC_1"); // aldri b2 sin konto
});

test("3b: ingen aktiv konto → ACCOUNT_NOT_FOUND (fail closed)", async () => {
  const db = makeDb({ social_channels: [{ brand_id: "b1", platform: "instagram", external_id: "x", is_active: false }] });
  await assert.rejects(() => resolvePublishingAccount(db, { brandId: "b1", channel: "instagram" }), /ACCOUNT_NOT_FOUND/);
});

// ── Content Hub slår generering; brand-isolasjon på DB-nivå ───────────────────
test("godkjent Content Hub-post (social_posts) slår unødvendig generering", async () => {
  const db = makeDb({
    social_posts: [
      { id: "p1", organization_id: "org1", platform: "instagram", content: "Godkjent villa-post", status: "approved", hook_type: "price_first", cta_type: "book_viewing", goal: "lead_generation", language: "no", created_at: "2026-08-15T00:00:00Z", updated_at: "2026-08-20T00:00:00Z" },
    ],
    media_assets: [],
  });
  const d = await resolveMarketingContent(db, { brandId: "b1", channel: "instagram", now: "2026-08-23T00:00:00Z" }, { organizationId: "org1" });
  assert.equal(d.decision, "reuse");
  assert.equal(d.chosen?.source, "content_hub_approved");
  assert.equal(d.chosen?.contentId, "social_post:p1");
});

test("media_assets fra feil brand hentes ikke (brand-scopet spørring)", async () => {
  const db = makeDb({
    social_posts: [],
    media_assets: [
      { id: "m1", brand_id: "b1", media_type: "image", public_url: "https://x/1.jpg", status: "active", is_favorite: true, created_at: "2026-08-20T00:00:00Z" },
      { id: "m2", brand_id: "b2", media_type: "image", public_url: "https://x/2.jpg", status: "active", is_favorite: true, created_at: "2026-08-20T00:00:00Z" },
    ],
  });
  const d = await resolveMarketingContent(db, { brandId: "b1", channel: "instagram", now: "2026-08-23T00:00:00Z" });
  // Kun b1-media i ranked; ingen b2.
  assert.ok(d.ranked.every((c) => c.brandId === "b1"));
  assert.ok(!d.ranked.some((c) => c.contentId === "media_asset:m2"));
});

test("ingen org-mapping → hopper over org-scopede kilder (fail-safe, ingen fuzzy-match)", async () => {
  const db = makeDb({ social_posts: [{ id: "p1", organization_id: "orgX", platform: "instagram", content: "x", status: "approved", created_at: "2026-08-20T00:00:00Z" }], media_assets: [] });
  const d = await resolveMarketingContent(db, { brandId: "b1", channel: "instagram", now: "2026-08-23T00:00:00Z" }); // ingen organizationId
  assert.equal(d.decision, "generate"); // rørte aldri orgX sitt innhold
});
