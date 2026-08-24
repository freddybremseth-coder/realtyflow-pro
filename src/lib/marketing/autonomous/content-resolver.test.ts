import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedAssetHash,
  assertBrandMatch,
  deriveProvenance,
  determineReuseMode,
  resolveContent,
  scoreCandidate,
  verifyAssetHash,
  type AssetHashParts,
  type ContentCandidate,
  type ResolverInput,
} from "@/lib/marketing/autonomous";

const NOW = "2026-08-23T00:00:00Z";
const input = (over: Partial<ResolverInput> = {}): ResolverInput => ({ brandId: "b1", channel: "instagram", now: NOW, ...over });
const cand = (over: Partial<ContentCandidate> = {}): ContentCandidate => ({
  source: "content_hub_approved", contentId: "x", brandId: "b1", channels: ["instagram"], humanApproved: true, createdAt: "2026-08-10T00:00:00Z", ...over,
});

test("1: riktig brand-asset velges", () => {
  const d = resolveContent([cand({ contentId: "ok", brandId: "b1" }), cand({ contentId: "other", brandId: "b2" })], input());
  assert.equal(d.decision, "reuse");
  assert.equal(d.chosen?.contentId, "ok");
  assert.equal(d.chosen?.brandId, "b1");
});

test("2: feil-brand-asset velges ALDRI (BRAND_MISMATCH, fail closed)", () => {
  const d = resolveContent([cand({ brandId: "b2" })], input({ brandId: "b1" }));
  assert.equal(d.decision, "generate"); // ingen kvalifisert → generér
  assert.equal(d.ranked.length, 0);
  assert.equal(scoreCandidate(cand({ brandId: "b2" }), input()).disqualified, "BRAND_MISMATCH");
  assert.throws(() => assertBrandMatch({ brandId: "b2" }, { brandId: "b1" }), /BRAND_MISMATCH/);
});

test("4: godkjent Content Hub-asset slår unødvendig AI-generering", () => {
  const d = resolveContent([cand({ source: "content_hub_approved", humanApproved: true })], input());
  assert.equal(d.decision, "reuse");
  assert.equal(d.chosen?.source, "content_hub_approved");
});

test("5: utdaterte fakta tvinger refresh + ny godkjenning", () => {
  const stale = cand({ factSources: [{ claim: "pris 500k", source: "prospekt" }], factCheckedAt: "2026-01-01T00:00:00Z" });
  const m = determineReuseMode(stale, input({ maxFactAgeDays: 45 }));
  assert.equal(m.mode, "refresh_facts");
  assert.equal(m.needsReapproval, true);
  const d = resolveContent([stale], input());
  assert.equal(d.decision, "adapt");
  assert.equal(d.chosen?.reuseMode, "refresh_facts");
});

test("6: kanal-mismatch lager derived asset (adapt_channel)", () => {
  const d = resolveContent([cand({ channels: ["linkedin"] })], input({ channel: "instagram" }));
  assert.equal(d.decision, "adapt");
  assert.equal(d.chosen?.reuseMode, "adapt_channel");
  assert.equal(d.chosen?.needsReapproval, true);
});

test("7: gjenbruk/fatigue senker score", () => {
  const fresh = scoreCandidate(cand({ contentId: "fresh" }), input());
  const fatigued = scoreCandidate(cand({ contentId: "tired", usageCount: 3, lastUsedAt: "2026-08-20T00:00:00Z" }), input());
  assert.ok(fatigued.score < fresh.score);
});

test("8: høy historisk forretningsverdi + eksperiment-bekreftet rangerer høyere", () => {
  const plain = cand({ contentId: "plain" });
  const proven = cand({ contentId: "proven", businessValue: 800, experimentBacked: true });
  const d = resolveContent([plain, proven], input());
  assert.equal(d.chosen?.contentId, "proven");
  assert.ok(d.ranked[0].score > d.ranked[1].score);
});

test("9: derived asset beholder provenance til Content Hub-parent", () => {
  const d = resolveContent([cand({ contentId: "parent1", channels: ["linkedin"] })], input({ channel: "instagram" }));
  const prov = deriveProvenance(d.chosen!, input({ channel: "instagram" }));
  assert.equal(prov.parentContentId, "parent1");
  assert.equal(prov.parentSource, "content_hub_approved");
  assert.equal(prov.reuseMode, "adapt_channel");
  assert.equal(prov.brandId, "b1");
});

test("10: approved_asset_hash fanger endringer etter godkjenning", () => {
  const parts: AssetHashParts = { sourceContentId: "social_post:1", finalCopy: "Villa i Finestrat", finalMedia: "https://x/i.jpg", brandId: "b1", accountId: "IG1", channel: "instagram", propertyIds: ["p1"], cta: "Book visning", factSources: [] };
  const h = approvedAssetHash(parts);
  assert.equal(verifyAssetHash(h, parts), true);
  assert.equal(verifyAssetHash(h, { ...parts, finalCopy: "ENDRET" }), false); // copy endret
  assert.equal(verifyAssetHash(h, { ...parts, accountId: "IG2" }), false); // konto endret
  assert.equal(verifyAssetHash(h, { ...parts, finalMedia: "https://x/other.jpg" }), false); // media endret
});
