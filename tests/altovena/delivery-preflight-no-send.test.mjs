import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const route=readFileSync("src/app/api/cron/altovena-delivery-preflight/route.ts","utf8");
const sql=readFileSync("supabase/migrations/20261018094500_altovena_delivery_preflight.sql","utf8");
const safety=readFileSync("src/lib/cron/safe-mode.ts","utf8");
test("delivery preflight cannot import a mail sender or call a provider",()=>{
  assert.doesNotMatch(route,/import .*smtp|import .*nodemailer|import .*resend|import .*send-brand-email/i);
  assert.doesNotMatch(route,/\b(?:sendEmail|sendBrandEmail|sendMail)\s*\(/);
  assert.match(route,/ALTOVENA_DELIVERY_PREFLIGHT_ENABLED/);
  assert.match(route,/ALTOVENA_LEAD_ALERT_SCAN_ENABLED/);
  assert.match(route,/resolveAltovenaDeliveryRecipients/);
  assert.match(route,/evaluateCronSafeMode\(PATH\)/);
  assert.match(safety,/"\/api\/cron\/altovena-delivery-preflight"/);
  assert.match(safety,/failClosed: FAIL_CLOSED_CONTROL_PATHS\.has\(pathname\)/);
});
test("candidate schema cannot claim SENT or DELIVERY state",()=>{
  assert.match(sql,/state text not null default 'PREPARED' check \(state in \('PREPARED','CANCELLED'\)\)/);
  assert.match(sql,/unique \(alert_id,operator_key,channel\)/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke execute on function public\.altovena_prepare_operator_delivery/);
  assert.match(sql,/from public,anon,authenticated/);
  assert.match(sql,/deliveryAttempted',false/);
  assert.match(sql,/emailSent',false/);
  assert.doesNotMatch(sql,/\b(?:smtp_send|send_email|resend_emails)\s*\(/i);
});
