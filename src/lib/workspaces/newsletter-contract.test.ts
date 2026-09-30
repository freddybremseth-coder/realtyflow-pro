import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("src/app/api/workspaces/[brandKey]/newsletter/route.ts", "utf8");
const unsubscribe = fs.readFileSync("src/app/api/public/newsletter-unsubscribe/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260930220000_workspace_newsletter_marketing.sql", "utf8");
const middleware = fs.readFileSync("src/middleware.ts", "utf8");

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
