import assert from "node:assert/strict";
import test from "node:test";
import { dispatchGeneratedAsset, planMarketingRun, type OrchestratorDeps } from "@/services/marketing/autonomous-orchestrator";
import { createMarketingRun, parseBrandContext, type ContentBrief, type GeneratedAsset, type GuardState, type MarketingRunState } from "@/lib/marketing/autonomous";
import type { ContentGenome } from "@/lib/marketing/genome";

function makeFake(state: any) {
  const calls: any = { upserts: [] };
  state.stores = state.stores ?? {};
  function make(table: string) {
    const api: any = {
      select: () => api, eq: () => api, order: () => api, limit: () => api,
      single: () => Promise.resolve(state.rows?.[table] ? { data: state.rows[table], error: null } : { data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => api, update: () => api,
      upsert: (p: any, o: any) => { calls.upserts.push({ table, p, o }); if (o?.onConflict) (state.stores[table] ??= new Map()).set(p[o.onConflict], p); return api; },
      then: (res: any, rej: any) => Promise.resolve({ error: null }).then(res, rej),
    };
    return api;
  }
  return { supabase: { from: make } as any, calls, state };
}

const g = (over: Partial<ContentGenome>): ContentGenome => ({ brandId: "b1", channel: "instagram", format: "reel", ...over });
const brief: ContentBrief = {
  contentId: "c1", campaignId: "camp1", parentContentId: null, marketingRunId: "mr1", brandId: "b1",
  strategy: "exploit", channel: "instagram", genome: g({ hookType: "price_first", ctaType: "book_viewing", goal: "lead_generation" }),
  angle: "Ny villa i Finestrat", goal: { kind: "leads", target: 5, horizonDays: 30 }, wantsLeadCapture: false, learningNotes: [],
};
const asset: GeneratedAsset = {
  contentId: "c1", creativeVariantId: "v1", campaignId: "camp1", channel: "instagram",
  genome: brief.genome, body: "Bli med på visning av denne villaen i Finestrat, book i dag.", cta: "Book visning", factSources: [], generator: {},
};
const guardState = (over: Partial<GuardState> = {}): GuardState => ({ autopilotEnabled: true, ...over });

function deps(fake: any, over: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return { supabase: fake.supabase, loadGuardState: async () => guardState(), now: () => new Date("2026-08-23T10:00:00Z"), ...over };
}

test("copilot: publisering blir utkast som krever godkjenning, aldri publisert", async () => {
  const fake = makeFake({});
  let approvalReq: any = null;
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "copilot" }), marketingRunId: "mr1" };
  const res = await dispatchGeneratedAsset(deps(fake, { requestApproval: async (i) => { approvalReq = i; return "appr1"; } }), { asset, brief, run });
  assert.equal(res.mode, "manual-review");
  assert.equal(res.state, "draft");
  assert.equal(res.published, false);
  assert.equal(res.approvalId, "appr1");
  assert.ok(approvalReq);
  const pub = fake.calls.upserts.find((u: any) => u.table === "marketing_publications");
  assert.equal(pub.o.onConflict, "idempotency_key");
});

test("FAIL-CLOSED: copilot-publisering uten approval-tjeneste blir paused, ikke stille draft", async () => {
  const fake = makeFake({});
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "copilot" }), marketingRunId: "mr1" };
  const res = await dispatchGeneratedAsset(deps(fake), { asset, brief, run }); // ingen requestApproval
  assert.equal(res.mode, "manual-review");
  assert.equal(res.state, "paused");
  assert.equal(res.error, "APPROVAL_SERVICE_UNAVAILABLE");
});

test("Brand Brain: forbudt påstand tvinger godkjenning selv på guarded+preapproved", async () => {
  const fake = makeFake({});
  const brand = parseBrandContext({ brandId: "b1", brandName: "Zen", forbiddenClaims: ["garantert avkastning"] });
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "guarded" }), marketingRunId: "mr1" };
  const bad: GeneratedAsset = { ...asset, body: "Kjøp nå — garantert avkastning på villaen." };
  const res = await dispatchGeneratedAsset(deps(fake), { asset: bad, brief, run, brand, preapprovedFormat: true });
  assert.notEqual(res.mode, "live");
});

test("novelty-gate: nesten-identisk asset regenereres (ingen publikasjon)", async () => {
  const fake = makeFake({});
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1" }), marketingRunId: "mr1" };
  const history = [{ genome: asset.genome, angle: brief.angle, usedAt: "2026-08-22T10:00:00Z" }];
  const res = await dispatchGeneratedAsset(deps(fake), { asset, brief, run, history });
  assert.equal(res.state, "regenerate");
  assert.ok(!fake.calls.upserts.some((u: any) => u.table === "marketing_publications"));
});

test("novelty-gate: identisk publisert caption stoppes selv om brief-vinkelen er ny", async () => {
  const fake = makeFake({});
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1" }), marketingRunId: "mr1" };
  const changedBrief = { ...brief, angle: "En helt ny planleggingsvinkel" };
  const publishedCaption = [asset.headline, asset.body, asset.cta].filter(Boolean).join("\n");
  const history = [{ genome: asset.genome, angle: publishedCaption, usedAt: "2026-08-22T10:00:00Z" }];
  const res = await dispatchGeneratedAsset(deps(fake), { asset, brief: changedBrief, run, history });
  assert.equal(res.state, "regenerate");
  assert.ok(!fake.calls.upserts.some((u: any) => u.table === "marketing_publications"));
});

test("sensitive fakta uten kilde (AI-generert) → BLOKKERT før approval (ingen approval)", async () => {
  const fake = makeFake({});
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "guarded" }), marketingRunId: "mr1" };
  const sensitive: GeneratedAsset = { ...asset, body: "Villa til pris 500000, garantert avkastning." };
  const res = await dispatchGeneratedAsset(deps(fake), { asset: sensitive, brief, run, preapprovedFormat: true, sourceType: "generated" });
  assert.equal(res.state, "paused");
  assert.equal(res.mode, "blocked");
  assert.match(res.error ?? "", /FACT_NOT_VERIFIED/);
  assert.equal(res.approvalId, null);
});

test("legacy self-source (factSources satt) → sensitive fakta blokkeres IKKE (passerer til approval)", async () => {
  const fake = makeFake({});
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "copilot" }), marketingRunId: "mr1" };
  const legacy: GeneratedAsset = { ...asset, body: "Villa til pris 500000 i Calpe.", factSources: [{ claim: "Villa til pris 500000 i Calpe.", source: "legacy (menneske-forfattet)" }] };
  const res = await dispatchGeneratedAsset(deps(fake, { requestApproval: async () => "appr1" }), { asset: legacy, brief, run, sourceType: "legacy_content_publication" });
  assert.notEqual(res.state, "paused");
  assert.equal(res.approvalId, "appr1");
});

test("generert innhold MED uavhengige factSources → sensitive fakta passerer (uavhengig kilde tillatt)", async () => {
  const fake = makeFake({});
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "copilot" }), marketingRunId: "mr1" };
  const sourced: GeneratedAsset = { ...asset, body: "Villa til pris 500000 i Calpe.", factSources: [{ claim: "pris 500000", source: "eiendomsdatabase/prospekt" }] };
  const res = await dispatchGeneratedAsset(deps(fake, { requestApproval: async () => "appr1" }), { asset: sourced, brief, run, sourceType: "generated" });
  assert.notEqual(res.state, "paused");
  assert.equal(res.approvalId, "appr1");
});

test("guarded + preapproved + publisher → publisert, guard-sjekk kjørt", async () => {
  const fake = makeFake({});
  let publishedWith: any = null;
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "guarded" }), marketingRunId: "mr1" };
  const res = await dispatchGeneratedAsset(
    deps(fake, { publisher: { publish: async (_a, o) => { publishedWith = o; return { state: "scheduled" }; } } }),
    { asset, brief, run, preapprovedFormat: true },
  );
  assert.equal(res.mode, "live");
  assert.equal(res.published, true);
  assert.equal(res.state, "scheduled");
  assert.ok(publishedWith.idempotencyKey);
});

test("guarded live men circuit breaker aktiv → ikke publisert (paused)", async () => {
  const fake = makeFake({});
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "guarded" }), marketingRunId: "mr1" };
  const res = await dispatchGeneratedAsset(
    deps(fake, { loadGuardState: async () => guardState({ failedPublications: 3 }), publisher: { publish: async () => ({ state: "published" }) } }),
    { asset, brief, run, preapprovedFormat: true },
  );
  assert.equal(res.mode, "live");
  assert.equal(res.published, false);
  assert.equal(res.state, "paused");
});

test("idempotent retry: samme publicationId gir én publikasjonsrad", async () => {
  const fake = makeFake({});
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1" }), marketingRunId: "mr1" };
  await dispatchGeneratedAsset(deps(fake), { asset, brief, run, publicationId: "pubX" });
  await dispatchGeneratedAsset(deps(fake), { asset, brief, run, publicationId: "pubX" });
  assert.equal(fake.state.stores["marketing_publications"].size, 1);
});

test("planMarketingRun persisterer run og starter på copilot", async () => {
  const fake = makeFake({});
  const input = { brandId: "b1", goals: [{ kind: "qualified_leads" as const, target: 10, horizonDays: 30 }], channels: ["instagram" as const], pipelineGaps: [], inventoryFocus: [], activeCampaignIds: [], budget: {}, publishingCapacityPerWeek: 7 };
  const { run, plan } = await planMarketingRun(deps(fake), input as any);
  assert.equal(run.level, "copilot");
  assert.ok(plan.production.exploit >= 0);
  const r = fake.calls.upserts.find((u: any) => u.table === "marketing_runs");
  assert.equal(r.o.onConflict, "marketing_run_id");
});

test("planMarketingRun honors stable IDs supplied by a cron slot", async () => {
  const fake = makeFake({});
  const input = { brandId: "b1", goals: [{ kind: "awareness" as const, target: 10 }], channels: ["instagram" as const], pipelineGaps: [], inventoryFocus: [], activeCampaignIds: [], budget: {}, publishingCapacityPerWeek: 4 };
  const { run } = await planMarketingRun(deps(fake), input as any, { marketingRunId: "mrun_autopilot_b1_instagram_20260902_h12", correlationId: "rf_autopilot_b1_instagram_20260902_h12" });
  assert.equal(run.marketingRunId, "mrun_autopilot_b1_instagram_20260902_h12");
  assert.equal(run.correlationId, "rf_autopilot_b1_instagram_20260902_h12");
});

// ── P1 Hardening: kvalitativ/komparativ påstandsverifisering ────────────────
test("CLAIM_NOT_VERIFIED: generert utfallspåstand uten kilde → BLOKKERT før approval (ingen approval)", async () => {
  const fake = makeFake({});
  let approvalCalled = false;
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "guarded" }), marketingRunId: "mr1" };
  const claimful: GeneratedAsset = { ...asset, body: "Disse boligene bidrar til lavere energikostnader.", factSources: [] };
  const res = await dispatchGeneratedAsset(
    deps(fake, { requestApproval: async () => { approvalCalled = true; return "appr1"; } }),
    { asset: claimful, brief, run, preapprovedFormat: true, sourceType: "generated" },
  );
  assert.equal(res.state, "paused");
  assert.equal(res.mode, "blocked");
  assert.match(res.error ?? "", /CLAIM_NOT_VERIFIED/);
  assert.equal(res.approvalId, null);
  assert.equal(approvalCalled, false, "approval skal ALDRI opprettes for CLAIM_NOT_VERIFIED");
});

test("CLAIM verified: samme påstand MED uavhengig factSource → passerer til approval", async () => {
  const fake = makeFake({});
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "copilot" }), marketingRunId: "mr1" };
  const sourced: GeneratedAsset = {
    ...asset,
    body: "Disse boligene bidrar til lavere energikostnader.",
    factSources: [{ claim: "lavere energikostnader dokumentert i energisertifikat (A)", source: "energisertifikat" }],
  };
  const res = await dispatchGeneratedAsset(
    deps(fake, { requestApproval: async () => "appr1" }),
    { asset: sourced, brief, run, sourceType: "generated" },
  );
  assert.notEqual(res.state, "paused");
  assert.equal(res.approvalId, "appr1");
});

test("BRAND_ROLE_MISMATCH: «våre boliger» med rådgiver-brand → BLOKKERT før approval", async () => {
  const fake = makeFake({});
  let approvalCalled = false;
  const brand = parseBrandContext({ brandId: "b1", brandName: "Zen Eco Homes" });
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "guarded" }), marketingRunId: "mr1" };
  const owned: GeneratedAsset = { ...asset, body: "Utforsk våre boliger på Costa Blanca.", factSources: [] };
  const res = await dispatchGeneratedAsset(
    deps(fake, { requestApproval: async () => { approvalCalled = true; return "appr1"; } }),
    { asset: owned, brief, run, brand, preapprovedFormat: true, sourceType: "generated" },
  );
  assert.equal(res.state, "paused");
  assert.equal(res.mode, "blocked");
  assert.match(res.error ?? "", /BRAND_ROLE_MISMATCH/);
  assert.equal(res.approvalId, null);
  assert.equal(approvalCalled, false);
});

test("formidler-formulering: «boligene vi hjelper deg å finne» → ikke blokkert", async () => {
  const fake = makeFake({});
  const brand = parseBrandContext({ brandId: "b1", brandName: "Zen Eco Homes" });
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "copilot" }), marketingRunId: "mr1" };
  const ok: GeneratedAsset = { ...asset, body: "Se boligene vi hjelper deg å finne på Costa Blanca.", factSources: [] };
  const res = await dispatchGeneratedAsset(
    deps(fake, { requestApproval: async () => "appr1" }),
    { asset: ok, brief, run, brand, sourceType: "generated" },
  );
  assert.notEqual(res.state, "paused");
  assert.equal(res.approvalId, "appr1");
});

test("energieffektiv Zen Eco Homes-caption uten energikilde blokkeres før review", async () => {
  const fake = makeFake({});
  const brand = parseBrandContext({ brandId: "b1", brandName: "Zen Eco Homes" });
  const run: MarketingRunState = { ...createMarketingRun({ brandId: "b1", level: "copilot" }), marketingRunId: "mr1" };
  const clean: GeneratedAsset = {
    ...asset,
    body: "Energieffektive boliger på Costa Blanca med norsk oppfølging hele veien.",
    factSources: [],
  };
  const res = await dispatchGeneratedAsset(
    deps(fake, { requestApproval: async () => "appr1" }),
    { asset: clean, brief, run, brand, sourceType: "generated" },
  );
  assert.equal(res.state, "paused");
  assert.equal(res.mode, "blocked");
  assert.equal(res.approvalId, null);
  assert.match(res.error || "", /CLAIM_NOT_VERIFIED/);
});
