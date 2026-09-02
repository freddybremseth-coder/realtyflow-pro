import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptGenomeToChannel,
  allocateExploration,
  atomizeCampaign,
  buildMarketingPlan,
  contentNoveltyScore,
  contentQualityGate,
  createMarketingRun,
  DEFAULT_GUARD_CONFIG,
  evaluateGuards,
  isReadyForLearning,
  markStageDone,
  proposeStrategyChange,
  publicationIdempotencyKey,
  resolveContent,
  resolveMarketingAutonomy,
  resumeStage,
  type CampaignPlan,
  type DirectorInput,
  type GeneratedAsset,
  type GuardState,
} from "@/lib/marketing/autonomous";
import type { GenomeRecommendation } from "@/lib/marketing/learning";
import type { ContentGenome } from "@/lib/marketing/genome";

const g = (over: Partial<ContentGenome>): ContentGenome => ({ brandId: "b1", channel: "instagram", format: "reel", ...over });

// ── 70/20/10 exploration ────────────────────────────────────────────────────
test("70/20/10 exploration-fordeling summerer til n", () => {
  const a = allocateExploration(10, { exploit: 0.7, adjacent: 0.2, experiment: 0.1 });
  assert.deepEqual(a, { exploit: 7, adjacent: 2, experiment: 1 });
});

test("liten ukekapasitet bevarer både adjacent og experiment", () => {
  const a = allocateExploration(5, { exploit: 0.7, adjacent: 0.2, experiment: 0.1 });
  assert.deepEqual(a, { exploit: 3, adjacent: 1, experiment: 1 });
});

// ── Learning inn i plan/brief ───────────────────────────────────────────────
const rec: GenomeRecommendation = {
  favor: { hookType: { value: "price_first", lift: 2.1, evidence: "reliable", experimentBacked: true }, ctaType: { value: "book_viewing", lift: 1.4, evidence: "promising" } },
  avoid: [{ dimension: "hookType", value: "question", lift: 0.4 }],
  notes: [],
};
const directorInput: DirectorInput = {
  brandId: "b1", brandName: "Zen Eco Homes",
  goals: [{ kind: "qualified_leads", target: 10, horizonDays: 30 }],
  pipelineGaps: [], inventoryFocus: ["Finestrat villas €450k–€750k"],
  activeCampaignIds: [], channels: ["instagram", "facebook", "youtube", "website"],
  budget: { contentBudgetEur: 0, productionBudgetEur: 0, paidMediaBudgetEur: 0, experimentBudgetEur: 0 },
  publishingCapacityPerWeek: 10,
};

test("learning-anbefaling går inn i planen (favored + avoided)", () => {
  const plan = buildMarketingPlan(directorInput, { marketingRunId: "mr1", correlationId: "rf_x", recommendation: rec });
  assert.equal(plan.favoredDimensions.hookType, "price_first");
  assert.ok(plan.avoidedDimensions.some((a) => a.dimension === "hookType" && a.value === "question"));
  assert.deepEqual(plan.production, { exploit: 7, adjacent: 2, experiment: 1 });
});

test("experiment-backed favored dim ender opp i brief-genome", () => {
  const campaign: CampaignPlan = {
    campaignId: "camp1", marketingRunId: "mr1", brandId: "b1", strategy: "exploit",
    goal: { kind: "qualified_leads", target: 10, horizonDays: 30 }, channels: ["youtube", "instagram"],
    masterIdea: "Finestrat buying guide",
  };
  const briefs = atomizeCampaign(campaign, { baseGenome: g({ hookType: "price_first", ctaType: "book_viewing" }), makeContentId: (i, c) => `c${i}_${c}` });
  assert.equal(briefs[0].genome.hookType, "price_first");
});

// ── Content atomization / channel adaptation ────────────────────────────────
test("atomization deler campaign_id og parent_content_id, egne content_id + kanal-genome", () => {
  const campaign: CampaignPlan = {
    campaignId: "camp1", marketingRunId: "mr1", brandId: "b1", strategy: "exploit",
    goal: { kind: "leads", target: 5, horizonDays: 30 }, channels: ["youtube", "instagram", "facebook"],
    masterIdea: "Finestrat buying guide",
  };
  const briefs = atomizeCampaign(campaign, { baseGenome: g({}), makeContentId: (i, c) => `c${i}_${c}` });
  assert.equal(briefs.length, 3);
  assert.equal(briefs[0].parentContentId, null);
  assert.equal(briefs[1].parentContentId, briefs[0].contentId);
  assert.ok(briefs.every((b) => b.campaignId === "camp1"));
  assert.equal(briefs[0].genome.channel, "youtube");
  assert.equal(briefs[0].genome.format, "video");
  assert.equal(briefs[1].genome.channel, "instagram");
});

test("channel adaptation setter kanal-native format", () => {
  assert.equal(adaptGenomeToChannel(g({}), "youtube").format, "video");
  assert.equal(adaptGenomeToChannel(g({}), "website").format, "article");
  assert.equal(adaptGenomeToChannel(g({}), "linkedin").format, "article");
});

// ── Novelty / fatigue ───────────────────────────────────────────────────────
test("novelty avviser nesten-identisk innhold", () => {
  const hist = [{ genome: g({ hookType: "listing", topic: "finestrat", area: "finestrat" }), angle: "5 reasons to live in Finestrat", usedAt: "2026-08-14T00:00:00Z" }];
  const r = contentNoveltyScore({ genome: g({ hookType: "listing", topic: "finestrat", area: "finestrat" }), angle: "5 reasons to live in Finestrat" }, hist, { now: "2026-08-23T00:00:00Z" });
  assert.equal(r.decision, "regenerate");
  assert.ok(r.similarity >= 0.85);
});

test("novelty godtar ny vinkel på samme tema", () => {
  const hist = [{ genome: g({ hookType: "listing", topic: "finestrat", area: "finestrat" }), angle: "5 reasons to live in Finestrat", usedAt: "2026-08-14T00:00:00Z" }];
  const r = contentNoveltyScore({ genome: g({ hookType: "price_first", topic: "comparison", area: "altea" }), angle: "€500k comparison with Altea" }, hist, { now: "2026-08-23T00:00:00Z" });
  assert.equal(r.decision, "ok");
  assert.ok(r.noveltyScore > 50);
});

test("autopilot cooldown diskvalifiserer en nylig brukt kilde", () => {
  const decision = resolveContent([{
    source: "ad_creative",
    contentId: "ad_creative:1",
    brandId: "b1",
    channels: ["instagram"],
    text: "Samme godkjente post",
    humanApproved: true,
    createdAt: "2026-08-20T00:00:00Z",
    lastUsedAt: "2026-09-01T10:00:00Z",
    usageCount: 1,
  }], {
    brandId: "b1",
    channel: "instagram",
    now: "2026-09-02T10:00:00Z",
    minimumReuseIntervalDays: 14,
  });
  assert.equal(decision.decision, "generate");
  assert.equal(decision.ranked.length, 0);
  assert.match(decision.reason, /Ingen egnet/);
});

// ── Autonomy / Policy Engine + nivå-tak ─────────────────────────────────────
test("copilot: publisering krever godkjenning, aldri live (autopublish forbudt)", () => {
  const r = resolveMarketingAutonomy("publish_social", "copilot");
  assert.notEqual(r.mode, "live");
  assert.equal(r.mode, "manual-review");
});

test("copilot: generering av utkast er live internt", () => {
  const r = resolveMarketingAutonomy("generate_social", "copilot");
  assert.equal(r.category, "generation");
  assert.equal(r.mode, "live");
});

test("observe: generering er blokkert", () => {
  assert.equal(resolveMarketingAutonomy("generate_social", "observe").mode, "blocked");
});

test("betaling er alltid human-required (også på optimized)", () => {
  assert.equal(resolveMarketingAutonomy("paid_budget_change", "copilot").mode, "human-required");
  assert.equal(resolveMarketingAutonomy("paid_budget_change", "optimized").mode, "human-required");
});

test("guarded: forhåndsgodkjent lavrisiko-format kan publiseres live", () => {
  const r = resolveMarketingAutonomy("publish_social", "guarded", { preapprovedFormat: true, confidence: 0.95, dataQuality: 0.95 });
  assert.equal(r.mode, "live");
});

// ── Quality gate ────────────────────────────────────────────────────────────
const asset = (over: Partial<GeneratedAsset>): GeneratedAsset => ({
  contentId: "c1", creativeVariantId: "v1", campaignId: "camp1", channel: "instagram",
  genome: g({ hookType: "price_first", ctaType: "book_viewing", goal: "lead_generation" }),
  body: "Bli med på visning av denne villaen i Finestrat.", cta: "Book visning", factSources: [], generator: {}, ...over,
});

test("quality gate: sensitive fakta uten kilde krever godkjenning", () => {
  const r = contentQualityGate(asset({ body: "Villa til pris 500000 i Finestrat." }));
  assert.ok(r.sensitiveClaimsWithoutSource.includes("pris"));
  assert.equal(r.requiresApproval, true);
});

test("quality gate: fakta med kilde er OK, gir score", () => {
  const r = contentQualityGate(asset({ body: "Villa til pris 500000 i Finestrat.", factSources: [{ claim: "pris 500000 fra prospekt", source: "prospekt" }] }));
  assert.equal(r.requiresApproval, false);
  assert.ok(r.score > 0);
});

// ── Guards / kill switch / breaker / budget ─────────────────────────────────
const gs = (over: Partial<GuardState>): GuardState => ({ autopilotEnabled: true, ...over });

test("global kill switch stopper alt", () => {
  const r = evaluateGuards(DEFAULT_GUARD_CONFIG, gs({ autopilotEnabled: false }), { kind: "publish", channel: "instagram" });
  assert.equal(r.allowed, false);
  assert.ok(r.reason.includes("Kill switch"));
});

test("paused kampanje stopper publisering", () => {
  const r = evaluateGuards(DEFAULT_GUARD_CONFIG, gs({ pausedCampaigns: ["camp1"] }), { kind: "publish", channel: "instagram", campaignId: "camp1" });
  assert.equal(r.allowed, false);
});

test("circuit breaker: >= 3 feilede publiseringer utløser breaker", () => {
  const r = evaluateGuards(DEFAULT_GUARD_CONFIG, gs({ failedPublications: 3 }), { kind: "publish", channel: "instagram" });
  assert.equal(r.allowed, false);
  assert.equal(r.tripBreaker, true);
});

test("budsjett/spend-guard stopper over døgngrense", () => {
  const r = evaluateGuards(DEFAULT_GUARD_CONFIG, gs({ aiSpendTodayEur: 24 }), { kind: "spend", amountEur: 5 });
  assert.equal(r.allowed, false);
});

test("regenerering-guard stopper etter maks", () => {
  const r = evaluateGuards(DEFAULT_GUARD_CONFIG, gs({ regenerationsByContent: { c1: 3 } }), { kind: "regenerate", contentId: "c1" });
  assert.equal(r.allowed, false);
});

// ── Feedback timing ─────────────────────────────────────────────────────────
test("umoden måling teller ikke i autonom læring", () => {
  assert.equal(isReadyForLearning("instagram", "2026-08-23T10:00:00Z", "2026-08-23T12:00:00Z"), false);
  assert.equal(isReadyForLearning("instagram", "2026-08-20T10:00:00Z", "2026-08-23T12:00:00Z"), true);
});

// ── Strategy update evidence gate ───────────────────────────────────────────
test("strategiendring med svak evidens avvises", () => {
  const p = proposeStrategyChange(
    { brandId: "b1", dimension: "hookType", reason: "føles bra", oldValue: "question", newValue: "price_first", supportingEvidence: "magefølelse", evidenceLevel: "directional", experimentBacked: false, reversibility: "reversible" },
    "copilot",
  );
  assert.equal(p.evidenceOk, false);
  assert.ok(p.reason.includes("Avvist"));
});

test("strategiendring med reliable evidens krever godkjenning på copilot", () => {
  const p = proposeStrategyChange(
    { brandId: "b1", dimension: "hookType", reason: "bevist", oldValue: "question", newValue: "price_first", supportingEvidence: "eksperiment e4", evidenceLevel: "reliable", experimentBacked: true, reversibility: "reversible" },
    "copilot",
  );
  assert.equal(p.evidenceOk, true);
  assert.equal(p.autonomy.mode, "manual-review");
});

// ── Run state machine: resumable + idempotent ───────────────────────────────
test("run gjenopptas fra første ikke-ferdige steg, idempotent", () => {
  let run = createMarketingRun({ brandId: "b1" });
  assert.equal(run.level, "copilot");
  assert.equal(resumeStage(run), "plan");
  run = markStageDone(run, "plan", "plan laget");
  run = markStageDone(run, "brief");
  run = markStageDone(run, "generate");
  assert.equal(resumeStage(run), "validate");
  const before = run;
  run = markStageDone(run, "generate");
  assert.equal(run, before);
});
