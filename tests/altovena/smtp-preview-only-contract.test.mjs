import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const route=readFileSync("src/app/api/cron/altovena-smtp-staging/route.ts","utf8");
const migration=readFileSync("supabase/migrations/20261018120500_altovena_smtp_attempt_boundary.sql","utf8");
const vercel=JSON.parse(readFileSync("vercel.json","utf8"));
test("staging SMTP sender cannot run automatically on production Vercel Cron",()=>{
 assert.equal(vercel.crons.some(row=>row.path==="/api/cron/altovena-smtp-staging"),false);
 assert.match(route,/process\.env\.VERCEL_ENV!=="preview"/);
 assert.match(route,/ALTOVENA_EMAIL_STAGING_SEND_ENABLED/);
 assert.match(route,/ALTOVENA_DELIVERY_PREFLIGHT_ENABLED/);
 assert.match(route,/ALTOVENA_LEAD_ALERT_SCAN_ENABLED/);
 assert.match(route,/evaluateCronSafeMode\(PATH\)/);
 assert.match(route,/validBearer\(request,secret\)/);
 assert.match(route,/runStagingOperatorSmtp/);
});
test("SMTP accepted is NEVER modeled as delivered or a retryable state",()=>{
 assert.match(migration,/state in \('ATTEMPTING','SMTP_ACCEPTED','OUTCOME_UNKNOWN'\)/);
 assert.doesNotMatch(migration,/state in \('.*DELIVERED/);
 assert.match(migration,/candidate_id uuid not null unique/);
 assert.match(migration,/not exists \(select 1 from public\.altovena_delivery_attempts/);
 assert.match(migration,/grant execute on function public\.altovena_claim_operator_smtp/);
 assert.match(migration,/revoke execute on function public\.altovena_claim_operator_smtp/);
});
