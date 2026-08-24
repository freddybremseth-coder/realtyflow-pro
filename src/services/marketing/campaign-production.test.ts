import assert from "node:assert/strict";
import test from "node:test";

// Deterministisk dry-run: ingen live-credentials i testmiljø.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.MARKETING_META_LIVE;
delete process.env.META_ACCESS_TOKEN;

import { createCampaignDraft, runApprovedPublicationProd } from "@/services/marketing/campaign-production";
import { removeLegacyScheduledRow } from "@/services/marketing/legacy-content-adapter";
import { runApprovedPublication as runApproved } from "@/services/marketing/publish-executor";
import { makeMetaPublisher } from "@/services/marketing/publishers/meta-publisher";
import { approvedAssetHash, type GeneratedAsset } from "@/lib/marketing/autonomous";
import type { ContentGenome } from "@/lib/marketing/genome";

/** Kapabel in-memory Supabase-fake (select/insert/update/upsert + filtre). */
function makeDb(opts: { fk?: boolean; failRunPersist?: boolean; failBridge?: boolean } = {}) {
  const tables: Record<string, any[]> = {};
  const tbl = (n: string) => (tables[n] ??= []);
  // FK-simulering: publikasjon → marketing_runs, OG approval → agent_runs (broen).
  const fkViolation = (name: string, r: any) => {
    if (!opts.fk) return false;
    if (name === "marketing_publications" && r?.marketing_run_id) {
      return !(tables["marketing_runs"] ?? []).some((x) => x.marketing_run_id === r.marketing_run_id);
    }
    if (name === "agentic_approvals" && r?.run_id) {
      return !(tables["agent_runs"] ?? []).some((x) => x.id === r.run_id);
    }
    return false;
  };
  function make(name: string) {
    const q: any = { op: null, payload: null, conflict: null, filters: [] };
    const match = (r: any) => q.filters.every(([c, v]: [string, unknown]) => r[c] === v);
    const fkError = () => {
      const rows = Array.isArray(q.payload) ? q.payload : [q.payload];
      const bad = rows.find((r: any) => fkViolation(name, r));
      if (bad) return { data: null, error: { message: `insert or update on table "${name}" violates foreign key constraint`, code: "23503" } };
      if (opts.failRunPersist && name === "marketing_runs") return { data: null, error: { message: "simulated marketing_runs persist failure", code: "XX000" } };
      if (opts.failBridge && name === "agent_runs") return { data: null, error: { message: "simulated agent_runs bridge persist failure", code: "XX000" } };
      return null;
    };
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
    const applyUpdate = () => { const hit: any[] = []; for (const r of tbl(name)) if (match(r)) { Object.assign(r, q.payload); hit.push(r); } return hit; };
    const terminal = () => {
      const fe = fkError(); if (fe) return fe;
      if (q.op === "insert") { applyInsert(); return { data: null, error: null }; }
      if (q.op === "update") { const rows = applyUpdate(); return { data: rows, error: null }; }
      if (q.op === "upsert") { applyUpsert(); return { data: null, error: null }; }
      return { data: tbl(name).filter(match), error: null };
    };
    const readSingle = () => ({ data: tbl(name).find(match) ?? null, error: null });
    const writeSingle = () => {
      const fe = fkError(); if (fe) return fe;
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

test("CANARY: legacy content_publication brukes som kilde (ingen AI), source=legacy", async () => {
  const db = makeDb();
  seedBrand(db);
  db.tables["content_publications"] = [{
    id: "pub1", brand_id: "b1", status: "published",
    description: "Eksklusiv nybygd villa i Calpe med havutsikt. Book en visning i dag.",
    ai_image_url: "https://cdn/zen/calpe.jpg", scheduled_platforms: ["instagram"],
    created_at: "2026-07-28T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  }];
  db.tables["social_channels"] = [{ brand_id: "b1", platform: "instagram", external_id: "IG1", is_active: true, display_name: "Zen IG", metadata: {} }];

  const draft = await createCampaignDraft(db, {
    brandId: "b1", masterIdea: "n/a", goal: { kind: "qualified_leads", target: 10, horizonDays: 30 },
    legacyPublicationId: "pub1", channel: "instagram", publishingAccountId: "IG1",
  });

  assert.equal(draft.results.length, 1); // kun instagram
  assert.equal(draft.results[0].source, "legacy_content_publication");
  assert.equal(draft.results[0].state, "draft");
  assert.equal(draft.results[0].mode, "manual-review");
  assert.ok(draft.results[0].approvalId);

  const pub = db.tables["marketing_publications"][0];
  assert.equal(pub.source_type, "legacy_content_publication");
  assert.equal(pub.source_id, "content_publication:pub1");
  assert.equal(pub.account_id, "IG1");
  assert.ok(pub.asset_hash);
  const asset = db.tables["marketing_assets"][0];
  assert.match(asset.body, /Calpe/);
  assert.equal(asset.media.imageUrl, "https://cdn/zen/calpe.jpg");
});

test("REGRESJON dobbel-post: scheduled legacy → snapshot → archived → publish; cron finner ikke originalen", async () => {
  delete process.env.MARKETING_META_LIVE; // dry-run publisering
  const db = makeDb();
  seedBrand(db);
  db.tables["content_publications"] = [{
    id: "pub1", brand_id: "b1", status: "scheduled", scheduled_at: "2026-09-02T09:00:00Z",
    description: "Luksusvilla i Benissa Costa med havutsikt, 4 soverom og 5 bad. Pris €2 450 000. Book en visning i dag.",
    ai_image_url: "https://cdn/benissa.jpg", scheduled_platforms: ["instagram"],
    created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-10T00:00:00Z",
  }];
  db.tables["social_channels"] = [{ brand_id: "b1", platform: "instagram", external_id: "IG1", is_active: true, metadata: {} }];

  // 1) Growth OS snapshot (leser legacy MENS status=scheduled → tiltrodd).
  const draft = await createCampaignDraft(db, { brandId: "b1", channel: "instagram", legacyPublicationId: "pub1", publishingAccountId: "IG1", goal: { kind: "qualified_leads", target: 10 }, masterIdea: "canary" });
  assert.equal(draft.results[0].source, "legacy_content_publication");
  assert.equal(draft.results[0].state, "draft"); // ikke rejected (pris er menneske-forfattet → ikke FACT_NOT_VERIFIED)
  const approvalId = draft.results[0].approvalId!;
  assert.ok(approvalId);

  // 2) Ta legacy ut av scheduleren (nøyaktig 1 rad). status → 'failed' (gyldig CHECK-verdi).
  const removed = await removeLegacyScheduledRow(db, "pub1");
  assert.equal(removed.removed, true);
  assert.equal(db.tables["content_publications"][0].status, "failed");
  assert.equal(db.tables["content_publications"][0].scheduled_at, null);
  // legacy cron (status='scheduled') finner ikke originalraden lenger → ingen dobbel-post.
  assert.equal(db.tables["content_publications"].filter((r: any) => r.status === "scheduled").length, 0);

  // 3) Godkjenn + Growth OS-publiser fra snapshot (dry-run).
  db.tables["agentic_approvals"].find((a: any) => a.id === approvalId).status = "approved";
  const exec = await runApprovedPublicationProd(db, { approvalId, executedBy: "freddy@extrade.es" });
  assert.equal(exec.ok, true);
  assert.equal(exec.executed, true);
});

test("PRODUKSJONS-INTEGRITET (FK): én kanonisk run; publikasjon-FK == returnert run", async () => {
  delete process.env.MARKETING_META_LIVE;
  const db = makeDb({ fk: true }); // publikasjon MÅ referere en persistert marketing_runs-rad
  seedBrand(db);
  db.tables["content_publications"] = [{ id: "pub1", brand_id: "b1", status: "scheduled", scheduled_at: "2026-09-02T00:00:00Z", description: "Luksusvilla i Benissa med havutsikt. Book en visning i dag.", ai_image_url: "https://x/i.jpg", scheduled_platforms: ["instagram"], created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-10T00:00:00Z" }];
  db.tables["social_channels"] = [{ brand_id: "b1", platform: "instagram", external_id: "IG1", is_active: true, metadata: {} }];

  const draft = await createCampaignDraft(db, { brandId: "b1", channel: "instagram", legacyPublicationId: "pub1", publishingAccountId: "IG1", goal: { kind: "qualified_leads", target: 10 }, masterIdea: "canary" });

  // Nøyaktig ÉN marketing_runs-rad (ingen dobbel run B).
  assert.equal(db.tables["marketing_runs"].length, 1);
  const canonical = db.tables["marketing_runs"][0].marketing_run_id;
  // Returnert run == den persisterte == FK-en i publikasjonen (ellers ville FK-en kastet over).
  assert.equal(draft.marketingRunId, canonical);
  const pub = db.tables["marketing_publications"][0];
  assert.ok(pub, "publikasjon skal finnes");
  assert.equal(pub.marketing_run_id, canonical);
  // campaign/content-IDer bærer samme kanoniske run-ID.
  assert.ok(draft.campaignId.includes(canonical), "campaignId skal inneholde run-ID");
  assert.ok(draft.results[0].contentId.includes(canonical), "contentId skal inneholde run-ID");
  // Agent-run-BRO: nøyaktig én, id == run-ID.
  assert.equal(db.tables["agent_runs"].length, 1);
  assert.equal(db.tables["agent_runs"][0].id, canonical);
  assert.equal(db.tables["agent_runs"][0].agent_id, "marketing-growth-os");
  // approval.run_id refererer en EKSISTERENDE agent_runs-rad (ellers ville FK-en kastet).
  const appr = db.tables["agentic_approvals"][0];
  assert.equal(appr.run_id, canonical);
  assert.ok(db.tables["agent_runs"].some((r: any) => r.id === appr.run_id));
  // Correlation-ID identisk på tvers av marketing_run, agent_run og approval.
  assert.equal(db.tables["marketing_runs"][0].correlation_id, draft.correlationId);
  assert.equal(db.tables["agent_runs"][0].correlation_id, draft.correlationId);
  assert.equal(appr.correlation_id, draft.correlationId);
  // Legacy-stien produserer fortsatt riktig kilde.
  assert.equal(draft.results[0].source, "legacy_content_publication");
});

test("agent-run-bro: persist-feil → INGEN approval (fail closed)", async () => {
  const db = makeDb({ failBridge: true });
  seedBrand(db);
  db.tables["content_publications"] = [{ id: "pub1", brand_id: "b1", status: "scheduled", description: "Villa. Book visning.", ai_image_url: "https://x/i.jpg", scheduled_platforms: ["instagram"] }];
  db.tables["social_channels"] = [{ brand_id: "b1", platform: "instagram", external_id: "IG1", is_active: true, metadata: {} }];
  await assert.rejects(
    () => createCampaignDraft(db, { brandId: "b1", channel: "instagram", legacyPublicationId: "pub1", publishingAccountId: "IG1", goal: { kind: "leads", target: 5 }, masterIdea: "canary" }),
    /AGENT_RUN_BRIDGE_FAILED/,
  );
  assert.ok(!db.tables["agentic_approvals"] || db.tables["agentic_approvals"].length === 0);
  assert.ok(!db.tables["marketing_publications"] || db.tables["marketing_publications"].length === 0);
});

test("agent-run-bro: idempotent — gjentatt ensure gir ingen duplikat", async () => {
  const { ensureMarketingAgentRun } = await import("@/services/marketing/marketing-approval");
  const db = makeDb();
  await ensureMarketingAgentRun(db, { marketingRunId: "mrun_x", correlationId: "rf_x" });
  await ensureMarketingAgentRun(db, { marketingRunId: "mrun_x", correlationId: "rf_x" });
  assert.equal(db.tables["agent_runs"].length, 1);
  assert.equal(db.tables["agent_runs"][0].id, "mrun_x");
});

test("FK-fake avviser approval UTEN bro (beviser at broen faktisk kreves)", async () => {
  const { makeMarketingApprovalRequester } = await import("@/services/marketing/marketing-approval");
  const db = makeDb({ fk: true }); // ingen agent_runs seedet → ingen bro
  const requester = makeMarketingApprovalRequester(db, { runId: "mrun_nobridge", correlationId: "rf_x" });
  await assert.rejects(() => requester({ publicationId: "pub1", contentId: "c1", channel: "instagram", reason: "x" }), /foreign key/i);
});

test("run-persistering feiler → INGEN publikasjon (fail closed, FK-en bevares)", async () => {
  const db = makeDb({ failRunPersist: true });
  seedBrand(db);
  db.tables["content_publications"] = [{ id: "pub1", brand_id: "b1", status: "scheduled", description: "Villa. Book visning.", ai_image_url: "https://x/i.jpg", scheduled_platforms: ["instagram"] }];
  db.tables["social_channels"] = [{ brand_id: "b1", platform: "instagram", external_id: "IG1", is_active: true, metadata: {} }];
  await assert.rejects(
    () => createCampaignDraft(db, { brandId: "b1", channel: "instagram", legacyPublicationId: "pub1", publishingAccountId: "IG1", goal: { kind: "leads", target: 5 }, masterIdea: "canary" }),
    /planMarketingRun persist failed/,
  );
  assert.ok(!db.tables["marketing_publications"] || db.tables["marketing_publications"].length === 0);
});

test("removeLegacyScheduledRow: 0 rader (ikke scheduled) → feiler fail-closed", async () => {
  const db = makeDb();
  db.tables["content_publications"] = [{ id: "pub1", brand_id: "b1", status: "draft" }];
  await assert.rejects(() => removeLegacyScheduledRow(db, "pub1"), /LEGACY_ROW_NOT_SCHEDULED/);
});

test("CANARY fail-closed: legacy-rad med meta-tekst avvises (rejected, ingen approval)", async () => {
  const db = makeDb();
  seedBrand(db);
  db.tables["content_publications"] = [{ id: "bad", brand_id: "b1", status: "published", description: "Jeg setter opp Marketing Agent til å generere denne posten.", ai_image_url: "https://x/i.jpg", scheduled_platforms: ["instagram"] }];
  db.tables["social_channels"] = [{ brand_id: "b1", platform: "instagram", external_id: "IG1", is_active: true, metadata: {} }];
  const draft = await createCampaignDraft(db, { brandId: "b1", masterIdea: "n/a", goal: { kind: "leads", target: 5, horizonDays: 30 }, legacyPublicationId: "bad", channel: "instagram", publishingAccountId: "IG1" });
  assert.equal(draft.results[0].state, "rejected");
  assert.match(draft.results[0].error ?? "", /NOT_PUBLISHABLE/);
  assert.ok(!db.tables["agentic_approvals"] || db.tables["agentic_approvals"].length === 0);
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

// ── MetaPublisher: virkelig IG/FB-livssyklus + ekstern idempotens ────────────
const igImage: GeneratedAsset = { contentId: "c1", creativeVariantId: "v1", campaignId: "camp1", channel: "instagram", genome: g({}), body: "Hei", cta: "Book", media: { imageUrl: "https://x/i.jpg", mediaType: "image" }, factSources: [], generator: {} };
const igReel: GeneratedAsset = { ...igImage, media: { videoUrl: "https://x/v.mp4", mediaType: "reel" } };
const igNoMedia: GeneratedAsset = { ...igImage, media: undefined };
const fbText: GeneratedAsset = { ...igImage, channel: "facebook", media: undefined };
const fbImage: GeneratedAsset = { ...igImage, channel: "facebook", media: { imageUrl: "https://x/i.jpg" } };

function fakeGraph(over: any = {}) {
  const calls: any = { createIgContainer: 0, getStatus: 0, publishIg: 0, fbPost: 0, fbPhoto: 0 };
  const statuses: string[] = over.statuses ?? ["FINISHED"];
  const g2: any = {
    createIgContainer: async () => { calls.createIgContainer++; return { id: `container_${calls.createIgContainer}` }; },
    getContainerStatus: async () => { calls.getStatus++; return { status: statuses.length > 1 ? statuses.shift()! : statuses[0] }; },
    publishIgMedia: async () => { calls.publishIg++; if (over.publishThrows) throw new Error("timeout-publish"); return { id: "ig_media_1" }; },
    createFbPost: async () => { calls.fbPost++; return { id: "fb_post_1" }; },
    createFbPhoto: async () => { calls.fbPhoto++; return { id: "fb_photo_1" }; },
    reconcile: over.reconcile,
  };
  return { g: g2, calls };
}
const igPub = (db: any, graph: any) => makeMetaPublisher({ supabase: db, live: true, igUserId: "IG1", graph });
const fbPub = (db: any, graph: any) => makeMetaPublisher({ supabase: db, live: true, pageId: "PAGE1", graph });

test("IG image: container → media_publish (posted først etter publish)", async () => {
  const db = makeDb(); const { g: graph, calls } = fakeGraph();
  const res = await igPub(db, graph).publish(igImage, { idempotencyKey: "k1" });
  assert.equal(res.externalId, "ig_media_1");
  assert.equal(calls.createIgContainer, 1);
  assert.equal(calls.getStatus, 0); // bilde: ingen polling
  assert.equal(calls.publishIg, 1);
  assert.equal(db.tables["marketing_publish_attempts"][0].status, "posted");
});

test("IG Reel: processing → FINISHED → publish (gjenopptar, ingen ny container)", async () => {
  const db = makeDb(); const { g: graph, calls } = fakeGraph({ statuses: ["IN_PROGRESS", "FINISHED"] });
  const pub = igPub(db, graph);
  await assert.rejects(() => pub.publish(igReel, { idempotencyKey: "k2" }), /IG_CONTAINER_PROCESSING/);
  const res = await pub.publish(igReel, { idempotencyKey: "k2" });
  assert.equal(res.externalId, "ig_media_1");
  assert.equal(calls.createIgContainer, 1); // ingen ny container ved retry
  assert.equal(calls.publishIg, 1);
});

test("container created + gjentatt processing: retry gjenopptar, ingen ny container", async () => {
  const db = makeDb(); const { g: graph, calls } = fakeGraph({ statuses: ["IN_PROGRESS"] });
  const pub = igPub(db, graph);
  await assert.rejects(() => pub.publish(igReel, { idempotencyKey: "k3" }), /PROCESSING/);
  await assert.rejects(() => pub.publish(igReel, { idempotencyKey: "k3" }), /PROCESSING/);
  assert.equal(calls.createIgContainer, 1);
});

test("publish timeout → reconcile finner posten (ingen re-publish)", async () => {
  const db = makeDb(); const { g: graph, calls } = fakeGraph({ publishThrows: true, reconcile: async () => ({ externalId: "ig_recovered" }) });
  const pub = igPub(db, graph);
  await assert.rejects(() => pub.publish(igReel, { idempotencyKey: "k4" }), /timeout-publish/);
  const res = await pub.publish(igReel, { idempotencyKey: "k4" });
  assert.equal(res.externalId, "ig_recovered");
  assert.equal(calls.publishIg, 1); // aldri re-publisert
});

test("publish timeout uten reconcile → manual_review + PUBLISH_UNCONFIRMED", async () => {
  const db = makeDb(); const { g: graph } = fakeGraph({ publishThrows: true });
  const pub = igPub(db, graph);
  await assert.rejects(() => pub.publish(igReel, { idempotencyKey: "k5" }), /timeout-publish/);
  await assert.rejects(() => pub.publish(igReel, { idempotencyKey: "k5" }), /PUBLISH_UNCONFIRMED/);
  assert.equal(db.tables["marketing_publish_attempts"].find((a: any) => a.idempotency_key === "k5").status, "manual_review");
});

test("FB tekst-post via /feed", async () => {
  const db = makeDb(); const { g: graph, calls } = fakeGraph();
  const res = await fbPub(db, graph).publish(fbText, { idempotencyKey: "k6" });
  assert.equal(res.externalId, "fb_post_1");
  assert.equal(calls.fbPost, 1);
});

test("FB bilde-post via /photos", async () => {
  const db = makeDb(); const { g: graph, calls } = fakeGraph();
  const res = await fbPub(db, graph).publish(fbImage, { idempotencyKey: "k7" });
  assert.equal(res.externalId, "fb_photo_1");
  assert.equal(calls.fbPhoto, 1);
});

test("Instagram uten media → MEDIA_ASSET_MISSING (fail-closed)", async () => {
  const db = makeDb(); const { g: graph } = fakeGraph();
  await assert.rejects(() => igPub(db, graph).publish(igNoMedia, { idempotencyKey: "k8" }), /MEDIA_ASSET_MISSING/);
});

test("uten credentials → dry-run (default), ingen Graph-kall", async () => {
  const db = makeDb(); const { g: graph, calls } = fakeGraph();
  const res = await makeMetaPublisher({ supabase: db, live: false, graph }).publish(igImage, { idempotencyKey: "k9" });
  assert.equal(res.dryRun, true);
  assert.equal(calls.createIgContainer, 0);
});

test("duplikat-invokasjon lager aldri duplikat ekstern post", async () => {
  const db = makeDb(); const { g: graph, calls } = fakeGraph();
  const pub = igPub(db, graph);
  await pub.publish(igImage, { idempotencyKey: "k10" });
  const res2 = await pub.publish(igImage, { idempotencyKey: "k10" });
  assert.equal(res2.externalId, "ig_media_1");
  assert.equal(calls.createIgContainer, 1); // ingen ny container
  assert.equal(calls.publishIg, 1); // ingen ny publish
});

// ── P0: executor resolver eksplisitt konto + verifiserer asset-hash ──────────
function seedPublishable(db: any, over: any = {}) {
  const media = { imageUrl: "https://x/i.jpg", mediaType: "image" };
  const asset = { creative_variant_id: "v1", content_id: "c1", campaign_id: "camp1", channel: "instagram", genome: { brandId: "b1", channel: "instagram", format: "image", hookType: "price_first", ctaType: "book_viewing", goal: "lead_generation" }, headline: "H", body: over.body ?? "B", cta: "Book", media, fact_sources: [], provenance: { propertyIds: [] } };
  const hash = approvedAssetHash({ sourceContentId: "c1", finalCopy: "H\nB\nBook", finalMedia: JSON.stringify(media), brandId: "b1", accountId: "IG1", channel: "instagram", propertyIds: [], cta: "Book", factSources: [] });
  db.tables["agentic_approvals"] = [{ id: "appr1", status: "approved", gated_action_class: "publish_social", subject_ref: "pub1", subject_type: "generic_agent_action", title: "t" }];
  db.tables["marketing_publications"] = [{ publication_id: "pub1", content_id: "c1", campaign_id: "camp1", marketing_run_id: "mr1", idempotency_key: "idk1", brand_id: "b1", account_id: "IG1", source_id: "c1", asset_hash: hash, state: "draft" }];
  db.tables["marketing_assets"] = [asset];
}

test("executor: eksplisitt konto sendes til publisher + hash matcher → publisert", async () => {
  const db = makeDb(); seedPublishable(db);
  let gotAccount: string | undefined;
  const publisher: any = { publish: async (_a: any, o: any) => { gotAccount = o.accountId; return { state: "published", externalId: "ext1" }; } };
  const res = await runApproved(db, { approvalId: "appr1", executedBy: "x", publisher, resolveAccount: async () => ({ accountId: "IG1" }) });
  assert.equal(res.executed, true);
  assert.equal(gotAccount, "IG1"); // publisher fikk eksplisitt konto, valgte ikke selv
});

test("executor: endret asset etter godkjenning → ASSET_MODIFIED (fail-closed)", async () => {
  const db = makeDb(); seedPublishable(db, { body: "MODIFISERT etter godkjenning" });
  const publisher: any = { publish: async () => ({ state: "published", externalId: "x" }) };
  const res = await runApproved(db, { approvalId: "appr1", executedBy: "x", publisher, resolveAccount: async () => ({ accountId: "IG1" }) });
  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /ASSET_MODIFIED/);
});

test("executor: intern/meta-tekst → PUBLISHABILITY_FAILED, NULL Meta-kall", async () => {
  const db = makeDb();
  seedPublishable(db, { body: "Jeg setter opp Marketing Agent til å generere denne posten." });
  let metaCalls = 0;
  const publisher: any = { publish: async () => { metaCalls++; return { state: "published", externalId: "x" }; } };
  const res = await runApproved(db, { approvalId: "appr1", executedBy: "x", publisher, resolveAccount: async () => ({ accountId: "IG1" }) });
  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /PUBLISHABILITY_FAILED/);
  assert.equal(metaCalls, 0); // ingen Meta-call ved publishability-feil
});

test("run-livssyklus: vellykket publish lukker agent_runs (completed) + marketing_runs (done)", async () => {
  const db = makeDb(); seedPublishable(db);
  db.tables["marketing_runs"] = [{ marketing_run_id: "mr1", stage: "plan" }];
  db.tables["agent_runs"] = [{ id: "mr1", status: "running" }];
  const publisher: any = { publish: async () => ({ state: "published", externalId: "ext1" }) };
  const exec = await runApproved(db, { approvalId: "appr1", executedBy: "x", publisher, resolveAccount: async () => ({ accountId: "IG1" }) });
  assert.equal(exec.executed, true);
  assert.equal(db.tables["agent_runs"][0].status, "completed");
  assert.equal(db.tables["agent_runs"][0].outcome, "executed");
  assert.ok(db.tables["agent_runs"][0].finished_at);
  assert.equal(db.tables["marketing_runs"][0].stage, "done");
});

test("run-livssyklus best-effort: lukking som kaster hindrer IKKE publish/executed (ingen dobbel-post)", async () => {
  const db = makeDb(); seedPublishable(db);
  db.tables["marketing_runs"] = [{ marketing_run_id: "mr1", stage: "plan" }];
  db.tables["agent_runs"] = [{ id: "mr1", status: "running" }];
  const origFrom = db.from;
  db.from = (name: string) => (name === "agent_runs" ? { update: () => ({ eq: () => { throw new Error("boom close"); } }) } : origFrom(name));
  const publisher: any = { publish: async () => ({ state: "published", externalId: "ext1" }) };
  const exec = await runApproved(db, { approvalId: "appr1", executedBy: "x", publisher, resolveAccount: async () => ({ accountId: "IG1" }) });
  assert.equal(exec.ok, true);
  assert.equal(exec.executed, true); // posten publisert selv om livssyklus-lukkingen kastet
});

test("executor: konto endret siden godkjenning → APPROVED_ASSET_CHANGED", async () => {
  const db = makeDb(); seedPublishable(db);
  const publisher: any = { publish: async () => ({ state: "published", externalId: "x" }) };
  const res = await runApproved(db, { approvalId: "appr1", executedBy: "x", publisher, resolveAccount: async () => ({ accountId: "IG_OTHER" }) });
  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /APPROVED_ASSET_CHANGED/);
});
