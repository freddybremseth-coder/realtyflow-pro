import assert from "node:assert/strict";
import test from "node:test";
import { preflightLiveCampaign, type PreflightDeps, type PreflightInput } from "@/services/marketing/preflight-live-campaign";

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

const greenTables = () => ({
  brand_context: [{ brand_id: "b1", brand_name: "Zen Eco Homes", content_hub_org_id: "org1", preferred_cta: "Book visning", languages: ["no"] }],
  social_channels: [{ brand_id: "b1", platform: "instagram", external_id: "IG1", is_active: true, display_name: "Zen IG", metadata: { service: "new_build" } }],
  social_posts: [{ id: "p1", content: "Villa i Finestrat", status: "approved", organization_id: "org1" }],
  media_assets: [] as any[],
});

const greenEnv = { autopilotEnabled: true, metaLive: true, metaToken: "tok", igUserId: "IG1", pageId: undefined, anthropicKey: "ak" };
const deps = (tables: any, envOver: any = {}, approvalConfigured = true): PreflightDeps => ({ supabase: makeDb(tables), env: { ...greenEnv, ...envOver }, approvalConfigured });
const input = (over: Partial<PreflightInput> = {}): PreflightInput => ({ brandId: "b1", channel: "instagram", service: "new_build", publishingAccountId: "IG1", contentHubItemId: "social_post:p1", mediaUrl: "https://x/i.jpg", ...over });

test("alt grønt → READY_FOR_LIVE med hash + konto", async () => {
  const r = await preflightLiveCampaign(deps(greenTables()), input());
  assert.equal(r.status, "READY_FOR_LIVE");
  assert.equal(r.criticalFailures.length, 0);
  assert.ok(r.assetHash);
  assert.equal(r.account?.accountId, "IG1");
});

test("INGEN Meta-call skjer under preflight (fetch aldri kalt)", async () => {
  let netCalls = 0;
  const orig = globalThis.fetch;
  (globalThis as any).fetch = async () => { netCalls++; return { ok: true, json: async () => ({}) } as any; };
  try {
    await preflightLiveCampaign(deps(greenTables()), input());
  } finally {
    globalThis.fetch = orig;
  }
  assert.equal(netCalls, 0);
});

test("kill switch AV → NOT_READY (fail closed)", async () => {
  const r = await preflightLiveCampaign(deps(greenTables(), { autopilotEnabled: false }), input());
  assert.equal(r.status, "NOT_READY");
  assert.ok(r.criticalFailures.some((f) => f.startsWith("kill_switch")));
});

test("manglende brand context → NOT_READY", async () => {
  const t = greenTables(); t.brand_context = [];
  const r = await preflightLiveCampaign(deps(t), input());
  assert.equal(r.status, "NOT_READY");
  assert.ok(r.criticalFailures.some((f) => f.startsWith("brand_context")));
});

test("tvetydig konto → NOT_READY (publishing_account)", async () => {
  const t = greenTables();
  t.social_channels = [
    { brand_id: "b1", platform: "instagram", external_id: "IG_A", is_active: true, display_name: "A", metadata: {} },
    { brand_id: "b1", platform: "instagram", external_id: "IG_B", is_active: true, display_name: "B", metadata: {} },
  ];
  const r = await preflightLiveCampaign(deps(t), input({ publishingAccountId: undefined, service: undefined }));
  assert.equal(r.status, "NOT_READY");
  assert.ok(r.criticalFailures.some((f) => f.includes("ACCOUNT_AMBIGUOUS")));
});

test("Instagram uten media → NOT_READY (media_url)", async () => {
  const r = await preflightLiveCampaign(deps(greenTables()), input({ mediaUrl: undefined }));
  assert.equal(r.status, "NOT_READY");
  assert.ok(r.criticalFailures.some((f) => f.startsWith("media_url")));
});

test("ikke-godkjent Content Hub-item → NOT_READY (human_approved)", async () => {
  const t = greenTables(); t.social_posts = [{ id: "p1", content: "utkast", status: "draft", organization_id: "org1" }];
  const r = await preflightLiveCampaign(deps(t), input());
  assert.equal(r.status, "NOT_READY");
  assert.ok(r.criticalFailures.some((f) => f.startsWith("human_approved")));
});

test("approval-tjeneste ikke koblet → NOT_READY (fail closed)", async () => {
  const r = await preflightLiveCampaign(deps(greenTables(), {}, false), input());
  assert.equal(r.status, "NOT_READY");
  assert.ok(r.criticalFailures.some((f) => f.startsWith("approval_service")));
});

test("dry_run: Meta ikke live → warn, men fortsatt READY (canary er gyldig)", async () => {
  const r = await preflightLiveCampaign(deps(greenTables(), { metaLive: false }), input({ mode: "dry_run" }));
  assert.equal(r.status, "READY_FOR_LIVE");
  assert.equal(r.mode, "dry_run");
  assert.ok(r.checks.some((c) => c.name === "meta_credentials" && c.status === "warn"));
});

test("live: Meta ikke live → NOT_READY (meta_credentials kritisk)", async () => {
  const r = await preflightLiveCampaign(deps(greenTables(), { metaLive: false }), input({ mode: "live" }));
  assert.equal(r.status, "NOT_READY");
  assert.equal(r.mode, "live");
  assert.ok(r.criticalFailures.some((f) => f.includes("META_CREDENTIALS_MISSING")));
});

test("live: alle creds satt → READY_FOR_LIVE (meta_credentials kritisk grønn)", async () => {
  const r = await preflightLiveCampaign(deps(greenTables()), input({ mode: "live" }));
  assert.equal(r.status, "READY_FOR_LIVE");
  assert.ok(r.checks.some((c) => c.name === "meta_credentials" && c.critical && c.status === "ok"));
});
