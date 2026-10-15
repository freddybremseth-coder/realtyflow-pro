import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

const fromRepo = (path: string) => readFileSync(new URL("../../../" + path, import.meta.url), "utf8");

test("Visibility queue API cannot accept caller-supplied findings", () => {
 const route = fromRepo("src/app/api/visibility/work-items/route.ts");
 assert.doesNotMatch(route, /export async function POST\(/);
 assert.match(route, /ctx\.role!=="OWNER"/);
 assert.match(route, /ctx\.source!=="owner-session"/);
});
test("Sync requires actual owner session and restricts cross-site requests", () => {
 const route = fromRepo("src/app/api/visibility/work-items/sync/route.ts");
 assert.match(route, /ctx\.role!=="OWNER"/);
 assert.match(route, /ctx\.source!=="owner-session"/);
 assert.match(route, /sec-fetch-site/);
 assert.match(route, /seo_gsc_live_read/);
 assert.match(route, /visibilityEvidenceAge\(raw\.checkedAt\)/);
 assert.doesNotMatch(route, /request\.json\(/);
 assert.match(route, /execution_started:false/);
 assert.match(route, /publication_authorized:false/);
});
test("Nexus queue RPC keeps invoker privileges and revokes public execution", () => {
 const sql = fromRepo("supabase/migrations/20261015195000_visibility_review_queue.sql").toLowerCase();
 assert.match(sql, /security invoker/);
 assert.match(sql, /revoke all on function public\.enqueue_visibility_review/);
 assert.match(sql, /from public, anon, authenticated/);
 assert.match(sql, /to service_role/);
 assert.match(sql, /pg_advisory_xact_lock/);
 assert.match(sql, /'proposed'/);
 assert.match(sql, /'publication_authorized',false/);
});
