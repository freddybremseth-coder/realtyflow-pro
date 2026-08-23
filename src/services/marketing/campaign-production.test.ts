import assert from "node:assert/strict";
import test from "node:test";

// Deterministisk dry-run: ingen live-credentials i testmiljø.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.MARKETING_META_LIVE;
delete process.env.META_ACCESS_TOKEN;

import { createCampaignDraft, runApprovedPublicationProd } from "@/services/marketing/campaign-production";
import { runApprovedPublication as runApproved } from "@/services/marketing/publish-executor";
import { makeMetaPublisher } from "@/services/marketing/publishers/meta-publisher";
import type { GeneratedAsset } from "@/lib/marketing/autonomous";
import type { ContentGenome } from "@/lib/marketing/genome";

/** Kapabel in-memory Supabase-fake (select/insert/update/upsert + filtre). */
function makeDb() {
  const tables: Record<string, any[]> = {};
  const tbl = (n: string) => (tables[n] ??= []);
  function make(name: string) {
    const q: any = { op: null, payload: null, conflict: null, filters: [] };
    const match = (r: any) => q.filters.every(([c, v]: [string, unknown]) => r[c] === v);
    const applyInsert = () => {
      const rows = Array.isArray(q.payload) ? q.payload : [q.payload];
      const ins = rows.map((r: any) => ({ id: r.id ?? `id_${tbl(name).length + 1}`, ...r }));
      ins.forEach((r: any) => tbl(name).push(r));
      return ins;
    };
    const applyUpsert = () => {
      const rows = Array.isArray(q.payload) ? q.payload : [q.payload];
      for (const r of rows) {
        const arr = tbl(name);
        const idx = q.conflict ? arr.findIndex((x) => x[q.conflict] === r[q.conflict]) : -1;
        if (idx >= 0) arr[idx] = { ...arr[idx], ...r };
        else arr.push({ id: r.id ?? `id_${arr.length + 1}`, ...r });
      }
    };
    const applyUpdate = () => { for (const r of tbl(name)) if (match(r)) Object.assign(r, q.payload); };
    const terminal = () => {
      if (q.op === "insert") { applyInsert(); return { data: null, error: null }; }
      if (q.op === "update") { applyUpdate(); return { data: null, error: null }; }
      if (q.op === "upsert") { applyUpsert(); return { data: null, error: null }; }
      return { data: tbl(name).filter(match), error: null };
    };
    const readSingle = () => ({ data: tbl(name).find(match) ?? null, error: null });
    const writeSingle = () => {
      if (q.op === "insert") return { data: applyInsert()[0], error: null };
      if (q.op === "upsert") { applyUpsert(); return readSingle(); }
      return readSingle();
    };
    const api: any = {
      select: () => api, order: () => api, limit: () => api,
      eq: (c: string, v: unknown) => { q.filters.push([c, v]); return api; },
      insert: (p: any) => { q.op = "insert"; q.payload = p; return api; },
      update: (p: any) => { q.op = "update"; q.payload = p; return api; },
      upsert: (p: any, o: any) => { q.op = "upsert"; q.payload = p; q.conflict = o?.onConflict; return api; },
      maybeSingle: () => Promise.resolve(readSingle()),
      single: () => Promise.resolve(writeSingle()),
      then: (res: any, rej: any) => Promise.resolve(terminal()).then(res, rej),
    };
    return api;
  }
  return { from: make, tables } as any;
}

const g = (over: Partial<ContentGenome>): ContentGenome => ({ brandId: "b1", channel: "instagram", format: "reel", ...over });
function seedBrand(db: any) {
  db.tables["brand_context"] = [{
    brand_id: "b1", brand_name: "Zen Eco Homes", voice: "varm", audience: "norske kjøpere",
    value_proposition: "bærekraftige villaer", preferred_cta: "Book visning",
    allowed_claims: [], forbidden_claims: ["garantert avkastning"], locations: ["Finestrat"],
    languages: ["no"], markets: [], services: [], urls: [], contact: {},
  }];
}

// ── Full chain: plan → creative → quality/brand → approval → publish (dry-run) ─
test("FIXTURE: hele kjeden plan → approval → published (dry-run)", async () => {
  const db = makeDb();
  seedBrand(db);
  const draft = await createCampaignDraft(db, { brandId: "b1", masterIdea: "Villa i Finestrat", goal: { kind: "qualified_leads", target: 10, horizonDays: 30 }, focus: "Finestrat" });

  assert.equal(draft.results.length, 2); // instagram + facebook
  for (const r of draft.results) {
    assert.equal(r.state, "draft");
    assert.equal(r.mode, "manual-review"); // COPILOT: krever godkjenning
    assert.ok(r.approvalId); // approval faktisk opprettet i gateway
  }
  assert.ok(db.tables["agentic_approvals"].length === 2);
  assert.ok(db.tables["marketing_assets"].length === 2); // provenance persistert
  assert.ok(db.tables["marketing_assets"].every((a: any) => a.provenance && a.prompt_version));

  // Menneske godkjenner første publikasjon.
  const approvalId = draft.results[0].approvalId!;
  db.tables["agentic_approvals"].find((a: any) => a.id === approvalId).status = "approved";

  const exec = await runApprovedPublicationProd(db, { approvalId, executedBy: "freddy@extrade.es" });
  assert.equal(exec.ok, true);
  assert.equal(exec.executed, true);
  assert.match(exec.detail ?? "", /DRY-RUN/);

  const pub = db.tables["marketing_publications"].find((p: any) => p.publication_id === draft.results[0].publicationId);
  assert.equal(pub.state, "published");
  assert.equal(db.tables["marketing_publish_attempts"].length, 1);
  assert.equal(db.tables["marketing_publish_attempts"][0].dry_run, true);
  assert.ok(db.tables["revenue_events"].some((e: any) => e.event_type === "automation_executed"));
});

test("duplicate retry: gjentatt run av samme approval publiserer ikke på nytt", async () => {
  const db = makeDb();
  seedBrand(db);
  const draft = await createCampaignDraft(db, { brandId: "b1", masterIdea: "Villa", goal: { kind: "leads", target: 5, horizonDays: 30 } });
  const approvalId = draft.results[0].approvalId!;
  db.tables["agentic_approvals"].find((a: any) => a.id === approvalId).status = "approved";
  await runApprovedPublicationProd(db, { approvalId, executedBy: "x" });
  const second = await runApprovedPublicationProd(db, { approvalId, executedBy: "x" });
  assert.equal(second.alreadyExecuted, true);
  assert.equal(db.tables["marketing_publish_attempts"].length, 1); // ingen dobbel-post
});

test("FAIL-CLOSED: manglende brand context stopper kampanjen", async () => {
  const db = makeDb(); // ingen brand seedet
  await assert.rejects(() => createCampaignDraft(db, { brandId: "ukjent", masterIdea: "x", goal: { kind: "leads", target: 5, horizonDays: 30 } }), /MISSING_BRAND_CONTEXT/);
});

test("rejected/ikke-godkjent approval kan ikke publiseres", async () => {
  const db = makeDb();
  seedBrand(db);
  const draft = await createCampaignDraft(db, { brandId: "b1", masterIdea: "Villa", goal: { kind: "leads", target: 5, horizonDays: 30 } });
  const approvalId = draft.results[0].approvalId!; // fortsatt pending
  const exec = await runApprovedPublicationProd(db, { approvalId, executedBy: "x" });
  assert.equal(exec.ok, false);
  assert.match(exec.error ?? "", /godkjente/);
  assert.ok(!db.tables["marketing_publish_attempts"]); // ingen publiseringsforsøk
});

test("FACT_NOT_VERIFIED: sensitive fakta uten kilde blokkeres ved execution", async () => {
  const db = makeDb();
  seedBrand(db);
  const draft = await createCampaignDraft(db, { brandId: "b1", masterIdea: "Villa", goal: { kind: "leads", target: 5, horizonDays: 30 } });
  const approvalId = draft.results[0].approvalId!;
  db.tables["agentic_approvals"].find((a: any) => a.id === approvalId).status = "approved";
  // Injiser sensitivt tall uten kilde i asset-en.
  const contentId = draft.results[0].contentId;
  const asset = db.tables["marketing_assets"].find((a: any) => a.content_id === contentId);
  asset.body = "Villa til pris 500000, uten kilde.";
  asset.fact_sources = [];
  const exec = await runApprovedPublicationProd(db, { approvalId, executedBy: "x" });
  assert.equal(exec.ok, false);
  assert.match(exec.error ?? "", /FACT_NOT_VERIFIED/);
});

// ── MetaPublisher ekstern idempotens ────────────────────────────────────────
const metaAsset: GeneratedAsset = { contentId: "c1", creativeVariantId: "v1", campaignId: "camp1", channel: "instagram", genome: g({}), body: "Hei", cta: "Book", factSources: [], generator: {} };

test("MetaPublisher live: publiserer via Graph og logger attempt", async () => {
  const db = makeDb();
  let calls = 0;
  const pub = makeMetaPublisher({ supabase: db, live: true, igUserId: "IG1", graphPost: async () => { calls++; return { id: "ig_1" }; } });
  const res = await pub.publish(metaAsset, { idempotencyKey: "k1" });
  assert.equal(res.externalId, "ig_1");
  assert.equal(calls, 1);
  assert.equal(db.tables["marketing_publish_attempts"][0].status, "posted");
});

test("MetaPublisher timeout + retry: avstemmer, poster ikke dobbelt", async () => {
  const db = makeDb();
  let calls = 0;
  const pub = makeMetaPublisher({ supabase: db, live: true, igUserId: "IG1", graphPost: async () => { calls++; throw new Error("timeout"); }, reconcile: async () => ({ externalId: "ig_recovered" }) });
  await assert.rejects(() => pub.publish(metaAsset, { idempotencyKey: "k2" }), /timeout/);
  // attempt står "posting"; retry avstemmer i stedet for å re-poste.
  const res = await pub.publish(metaAsset, { idempotencyKey: "k2" });
  assert.equal(res.externalId, "ig_recovered");
  assert.equal(calls, 1); // Graph ble ALDRI kalt på nytt
});

test("MetaPublisher timeout uten reconcile → PUBLISH_UNCONFIRMED (fail-closed)", async () => {
  const db = makeDb();
  const pub = makeMetaPublisher({ supabase: db, live: true, igUserId: "IG1", graphPost: async () => { throw new Error("timeout"); } });
  await assert.rejects(() => pub.publish(metaAsset, { idempotencyKey: "k3" }), /timeout/);
  await assert.rejects(() => pub.publish(metaAsset, { idempotencyKey: "k3" }), /PUBLISH_UNCONFIRMED/);
});

test("MetaPublisher uten credentials → dry-run (default)", async () => {
  const db = makeDb();
  let calls = 0;
  const pub = makeMetaPublisher({ supabase: db, live: false, graphPost: async () => { calls++; return { id: "x" }; } });
  const res = await pub.publish(metaAsset, { idempotencyKey: "k4" });
  assert.equal(res.dryRun, true);
  assert.equal(calls, 0);
});

// runApproved fra publish-executor er samme funksjon (import-sjekk).
test("runApprovedPublication er eksportert fra publish-executor", () => {
  assert.equal(typeof runApproved, "function");
});
