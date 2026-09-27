import test from "node:test";
import assert from "node:assert/strict";
import { verifyZenEcoPublishedMetadataHtml } from "./seo-zeneco-publisher";

const path = "/bolig-i-spania";
const title = "Bolig i Spania | Finn riktig område med norsk rådgiver";
const description = "Vurderer du bolig i Spania? Utforsk områder på Costa Blanca og få hjelp til å sammenligne nybygg, villaer og leiligheter, finansiering og kjøpsprosess.";
const canonical = "https://www.zenecohomes.com" + path;
function html(t = title, d = description, url = canonical) {
  return `<!doctype html><html lang="no"><head><meta charset="utf-8"/><title>${t}</title><meta name="description" content="${d}"/><link rel="canonical" href="${url}"/><meta property="og:description" content="${d}"/></head><body>Contents</body></html>`;
}

test("Only correct public title, meta description and canonical pass SEO publication verification", () => {
  assert.equal(verifyZenEcoPublishedMetadataHtml(html(), path, title, description), true);
  assert.equal(verifyZenEcoPublishedMetadataHtml(html(title + " | Zen Eco Homes"), path, title, description), false);
  assert.equal(verifyZenEcoPublishedMetadataHtml(html("Old title"), path, title, description), false);
  assert.equal(verifyZenEcoPublishedMetadataHtml(html(title, "Old description"), path, title, description), false);
  assert.equal(verifyZenEcoPublishedMetadataHtml(html(title, description, "https://www.zenecohomes.com/other"),
    path, title, description), false);
});

test("Mention in page body or OpenGraph metadata cannot simulate a published SEO head", () => {
  const fake = `<head><title>Old title</title><meta name="description" content="Old"/><meta property="og:title" content="${title}"/><meta property="og:description" content="${description}"/><link rel="canonical" href="${canonical}"/></head><body>${title}${description}</body>`;
  assert.equal(verifyZenEcoPublishedMetadataHtml(fake, path, title, description), false);
  assert.equal(verifyZenEcoPublishedMetadataHtml("<title>" + title + "</title>", path, title, description), false);
});

import { runZenEcoMetadataPublisher } from "./seo-zeneco-publisher";
import { ZENECO_METADATA_VARIANTS } from "./seo-zeneco-metadata";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GSCBrandSnapshot } from "./seo-search-console";

const now = new Date("2026-09-26T12:00:00Z");
const variant = ZENECO_METADATA_VARIANTS[0];
const checks = { ready: async () => true, visible: async () => true };
function attempt() {
  return { id: "attempt-1", action: "seo_zeneco_metadata_attempt", status: "partial",
    created_at: now.toISOString(), details: {
      change_id: "zeneco_bolig_i_spania_20260923", page: variant.path, title: variant.title,
      description: variant.description, query: variant.query, metadata_revision: 1,
      applied_at: now.toISOString(), baseline_period_start: "2026-08-25", baseline_period_end: "2026-09-23",
      baseline_impressions: 50, baseline_clicks: 1, baseline_position: 8,
    } };
}
function googleSnapshot(): GSCBrandSnapshot {
  return { brandId: "zeneco", connected: true, property: "sc-domain:zenecohomes.com",
    collectedAt: now.toISOString(), period: { currentStart: "2026-08-25", currentEnd: "2026-09-23",
      previousStart: "2026-07-26", previousEnd: "2026-08-24" },
    metric: "Google Search Console web Search Analytics; grouped by canonical page",
    totals: { currentClicks: 1, currentImpressions: 140, previousClicks: 0, previousImpressions: 0,
      currentCtr: 1/140, previousCtr: null },
    topPages: [{ path: variant.path, clicks: 1, impressions: 140, ctr: 1/140, position: 8 }],
    topQueryPages: [{ page: variant.path, query: variant.query, clicks: 1, impressions: 50, ctr: .02, position: 8 }],
    dataQuality: { truncated: false, queryRowsSampled: true, note: "measured" },
  };
}

type Row = Record<string, any>;
/** Stateful fake of the existing DB contract: exercises recovery across calls. */
function database(initial: Row[] = []) {
  const logs = structuredClone(initial);
  const overrides: Row[] = [];
  const rpcCalls: Row[] = [];
  const failures = { effect: false, finalize: false, attempt: false };
  const client = {
    from(table: string) {
      let operation = "select";
      let payload: Row = {};
      const filters: Array<(row: Row) => boolean> = [];
      const execute = () => {
        const rows = table === "automation_logs" ? logs : overrides;
        if (operation === "insert") {
          if ((payload.action === "seo_autopilot_change" && failures.effect) ||
              (payload.action === "seo_zeneco_metadata_attempt" && failures.attempt)) {
            return { data: null, error: { code: "TEST_WRITE_FAILURE" } };
          }
          const row = { ...payload, id: "row-" + logs.length, created_at: now.toISOString() };
          rows.push(row);
          return { data: row, error: null };
        }
        const matches = rows.filter(row => filters.every(filter => filter(row)));
        if (operation === "update") {
          if (failures.finalize) return { data: null, error: { code: "TEST_FINALIZE_FAILURE" } };
          matches.forEach(row => Object.assign(row, payload));
        }
        return { data: matches, error: null };
      };
      const chain: any = {
        select: () => chain,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
        gte: (key: string, value: string) => { filters.push(row => row[key] >= value); return chain; },
        contains: (key: string, value: Row) => { filters.push(row => Object.entries(value).every(([k,v]) => row[key]?.[k] === v)); return chain; },
        order: () => chain, limit: () => chain,
        insert: (row: Row) => { operation = "insert"; payload = row; return chain; },
        update: (row: Row) => { operation = "update"; payload = row; return chain; },
        maybeSingle: async () => { const result = execute(); return { ...result, data: Array.isArray(result.data) ? result.data[0] || null : result.data }; },
        single: async () => execute(),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject),
      };
      return chain;
    },
    async rpc(_name: string, args: Row) {
      rpcCalls.push(args);
      return { error: null, data: [{ page_path: args.p_path, revision: args.p_expected_revision + 1,
        active: args.p_action === "apply", changed: true }] };
    },
  } as unknown as SupabaseClient;
  return { client, logs, failures, rpcCalls, overrides };
}

test("failed effect audit remains pending and is recovered on next automatic cycle", async () => {
  const db = database([attempt()]);
  db.failures.effect = true;
  await assert.rejects(runZenEcoMetadataPublisher(db.client, null, "https://same.supabase.co", now, checks), /change audit failed/);
  assert.equal(db.logs[0].status, "partial");
  db.failures.effect = false;
  const result = await runZenEcoMetadataPublisher(db.client, null, "https://same.supabase.co", now, checks);
  assert.equal(result.published, 1);
  assert.equal(db.logs[0].status, "success");
  assert.equal(db.logs.filter(row => row.action === "seo_autopilot_change").length, 1);
  assert.equal(db.rpcCalls.length, 0);
});

test("failed finalization retries without duplicating the saved effect audit", async () => {
  const db = database([attempt()]);
  db.failures.finalize = true;
  await assert.rejects(runZenEcoMetadataPublisher(db.client, null, "https://same.supabase.co", now, checks));
  db.failures.finalize = false;
  await runZenEcoMetadataPublisher(db.client, null, "https://same.supabase.co", now, checks);
  assert.equal(db.logs.filter(row => row.action === "seo_autopilot_change").length, 1);
  assert.equal(db.logs[0].status, "success");
});

test("new revision can be verified in the same cycle without waiting a day", async () => {
  const db = database();
  const result = await runZenEcoMetadataPublisher(db.client, googleSnapshot(), "https://same.supabase.co", now, checks);
  assert.equal(result.status, "verified");
  assert.equal(result.published, 1);
  assert.equal(db.rpcCalls.length, 1);
  assert.equal(db.logs.filter(row => row.action === "seo_autopilot_change").length, 1);
});

test("unconfirmed fresh publication remains pending; stale publication rolls back exact revision", async () => {
  const db = database();
  const invisible = { ...checks, visible: async () => false };
  const result = await runZenEcoMetadataPublisher(db.client, googleSnapshot(), "https://same.supabase.co", now, invisible);
  assert.equal(result.status, "pending");
  assert.equal(result.published, 0);
  const later = new Date(now.getTime() + 73 * 3600000);
  const rollback = await runZenEcoMetadataPublisher(db.client, null, "https://same.supabase.co", later, invisible);
  assert.equal(rollback.status, "rollback");
  assert.equal(db.rpcCalls[1].p_action, "rollback");
  assert.equal(db.rpcCalls[1].p_expected_revision, 1);
});

test("tampered pending page or metadata cannot trigger fetching or rollback", async () => {
  for (const change of [{ page: "/not-in-pilot" }, { title: "Unapproved copy" }, { metadata_revision: 0 }]) {
    const row = attempt();
    Object.assign(row.details, change);
    const db = database([row]);
    const result = await runZenEcoMetadataPublisher(db.client, null, "https://same.supabase.co", now, {
      ready: async () => { assert.fail("Untrusted attempt must not be executed"); }, visible: checks.visible,
    });
    assert.equal(result.status, "blocked");
    assert.equal(db.rpcCalls.length, 0);
  }
});

test("publisher skips historical page and uses the next eligible one", async () => {
  const db = database();
  db.overrides.push({ brand_id: "zeneco", page_path: variant.path, active: false, revision: 2 });
  const snap = googleSnapshot();
  const second = ZENECO_METADATA_VARIANTS[1];
  snap.topPages.push({ ...snap.topPages[0], path: second.path });
  snap.topQueryPages.push({ ...snap.topQueryPages[0], page: second.path, query: second.query });
  const result = await runZenEcoMetadataPublisher(db.client, snap, "https://same.supabase.co", now, checks);
  assert.equal(result.page, second.path);
  assert.equal(db.rpcCalls[0].p_path, second.path);
});

test("28-day portfolio limit is retained and does not publish another experiment", async () => {
  const prior = attempt();
  prior.status = "success";
  const db = database([prior]);
  const result = await runZenEcoMetadataPublisher(db.client, googleSnapshot(), "https://same.supabase.co", now, checks);
  assert.equal(result.status, "monitor");
  assert.match(result.reason, /28 dager/);
  assert.equal(db.rpcCalls.length, 0);
});

test("failed attempt logging rolls back the newly applied revision", async () => {
  const db = database();
  db.failures.attempt = true;
  await assert.rejects(runZenEcoMetadataPublisher(db.client, googleSnapshot(), "https://same.supabase.co", now, checks), /rolled back/);
  assert.equal(db.rpcCalls[1].p_action, "rollback");
  assert.equal(db.rpcCalls[1].p_expected_revision, 1);
});

test("unverified receiver blocks writes even with strong Google evidence", async () => {
  const db = database();
  const result = await runZenEcoMetadataPublisher(db.client, googleSnapshot(), "https://same.supabase.co", now,
    { ...checks, ready: async () => false });
  assert.equal(result.status, "blocked");
  assert.equal(db.rpcCalls.length, 0);
});
