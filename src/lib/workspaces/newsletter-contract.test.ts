import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("src/app/api/workspaces/[brandKey]/newsletter/route.ts", "utf8");
const unsubscribe = fs.readFileSync("src/app/api/public/newsletter-unsubscribe/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260930220000_workspace_newsletter_marketing.sql", "utf8");
const middleware = fs.readFileSync("src/middleware.ts", "utf8");
const sender = fs.readFileSync("src/lib/workspaces/newsletter-send.ts", "utf8");
const scheduler = fs.readFileSync("src/app/api/cron/workspace-newsletter-send/route.ts", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");

test("newsletter workspace is permission and consent gated", () => {
  assert.match(route, /requireBrandWorkspace\(request, params\.brandKey, "email\.draft"\)/);
  assert.match(route, /requireBrandWorkspace\(request, params\.brandKey, "email\.send"\)/);
  assert.match(route, /consentConfirmed === true/);
  assert.match(route, /checkSuppression/);
  assert.match(route, /RECIPIENT_SUPPRESSED/);
});

test("newsletter subscribers are brand scoped and not inferred from CRM", () => {
  assert.match(migration, /brand_id uuid not null references core\.brands/);
  assert.match(migration, /consent_source text not null/);
  assert.match(migration, /consent_at timestamptz not null/);
  assert.match(migration, /unique \(brand_id, email\)/);
  assert.doesNotMatch(route, /from\("contacts"\).*insert/s);
});

test("unsubscribe endpoint is public but token scoped", () => {
  assert.match(middleware, /"\/api\/public\/newsletter-unsubscribe"/);
  assert.match(unsubscribe, /unsubscribe_token/);
  assert.match(unsubscribe, /status: "unsubscribed"/);
});


test("newsletter supports brand-scoped segments, scheduling and engagement tracking", () => {
  assert.match(route, /segmentFilter/);
  assert.match(route, /schedule_campaign/);
  assert.match(sender, /workspace_newsletter_links/);
  assert.match(sender, /newsletter-open/);
  assert.match(sender, /newsletter-click/);
  assert.match(sender, /bodyHtml/);
});

test("scheduled newsletters are claimed before send to reduce duplicate sends", () => {
  assert.match(scheduler, /eq\("status", "scheduled"\)/);
  assert.match(scheduler, /ALREADY_CLAIMED/);
  const config = JSON.parse(vercel);
  const cron = config.crons.find((item: any) => item.path === "/api/cron/workspace-newsletter-send");
  assert.equal(cron?.schedule, "*/5 * * * *");
});

test("tracking endpoints are public while workspace newsletter remains permission gated", () => {
  assert.match(middleware, /"\/api\/public\/newsletter-open"/);
  assert.match(middleware, /"\/api\/public\/newsletter-click"/);
  assert.match(route, /requireBrandWorkspace/);
});
