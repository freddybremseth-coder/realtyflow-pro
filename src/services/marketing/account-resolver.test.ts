import assert from "node:assert/strict";
import test from "node:test";
import { resolvePublishingAccount } from "@/services/marketing/account-resolver";

function makeDb(tables: Record<string, any[]>) {
  function make(name: string) {
    const filters: Array<[string, any]> = [];
    const rows = () => (tables[name] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return api;
  }
  return { from: make } as any;
}

const ch = (over: any) => ({ brand_id: "b1", platform: "instagram", is_active: true, display_name: "IG", metadata: {}, ...over });

test("12a: to aktive IG-kontoer samme brand → ACCOUNT_AMBIGUOUS", async () => {
  const db = makeDb({ social_channels: [ch({ external_id: "IG_A" }), ch({ external_id: "IG_B" })] });
  await assert.rejects(() => resolvePublishingAccount(db, { brandId: "b1", channel: "instagram" }), /ACCOUNT_AMBIGUOUS/);
});

test("12b: eksplisitt publishing_account_id → riktig konto (AI kan ikke overstyre)", async () => {
  const db = makeDb({ social_channels: [ch({ external_id: "IG_A" }), ch({ external_id: "IG_B" })] });
  const acc = await resolvePublishingAccount(db, { brandId: "b1", channel: "instagram", publishingAccountId: "IG_B" });
  assert.equal(acc.accountId, "IG_B");
});

test("12c: konto tilhører feil brand → BRAND_MISMATCH", async () => {
  const db = makeDb({ social_channels: [ch({ external_id: "IG_A" }), { brand_id: "b2", platform: "instagram", external_id: "IG_X", is_active: true, display_name: "other", metadata: {} }] });
  await assert.rejects(() => resolvePublishingAccount(db, { brandId: "b1", channel: "instagram", publishingAccountId: "IG_X" }), /BRAND_MISMATCH/);
});

test("12d: riktig brand / feil service → ACCOUNT_SCOPE_MISMATCH", async () => {
  const db = makeDb({ social_channels: [ch({ external_id: "IG_A", metadata: { service: "advisory" } })] });
  await assert.rejects(() => resolvePublishingAccount(db, { brandId: "b1", channel: "instagram", service: "new_build", publishingAccountId: "IG_A" }), /ACCOUNT_SCOPE_MISMATCH/);
});

test("12e: konto endret etter godkjenning håndteres i executor (se campaign-production)", () => {
  assert.ok(true); // dekket av executor-test APPROVED_ASSET_CHANGED
});

test("12f: inaktiv konto → ACCOUNT_NOT_FOUND", async () => {
  const db = makeDb({ social_channels: [ch({ external_id: "IG_A", is_active: false })] });
  await assert.rejects(() => resolvePublishingAccount(db, { brandId: "b1", channel: "instagram" }), /ACCOUNT_NOT_FOUND/);
  await assert.rejects(() => resolvePublishingAccount(db, { brandId: "b1", channel: "instagram", publishingAccountId: "IG_A" }), /ACCOUNT_NOT_FOUND/);
});

test("12g: service-scopet auto-routing velger riktig konto (entydig)", async () => {
  const db = makeDb({ social_channels: [
    ch({ external_id: "IG_ADV", metadata: { service: "advisory" } }),
    ch({ external_id: "IG_NB", metadata: { service: "new_build" } }),
  ] });
  const acc = await resolvePublishingAccount(db, { brandId: "b1", channel: "instagram", service: "new_build" });
  assert.equal(acc.accountId, "IG_NB");
});

test("0 treff → ACCOUNT_NOT_FOUND", async () => {
  const db = makeDb({ social_channels: [] });
  await assert.rejects(() => resolvePublishingAccount(db, { brandId: "b1", channel: "instagram" }), /ACCOUNT_NOT_FOUND/);
});
