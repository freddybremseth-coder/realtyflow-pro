import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const API_ROOT = path.join(process.cwd(), "src/app/api/saas");

const PUBLIC_OR_EXTERNALLY_AUTHED_ROUTES = new Map<
  string,
  { reason: string; marker: RegExp }
>([
  ["stripe/route.ts", { reason: "Stripe webhook signature", marker: /(?=.*verifyStripeWebhookSignature\()(?=.*STRIPE_WEBHOOK_SECRET)/s }],
  ["demosites/expire/route.ts", { reason: "cron secret", marker: /DEMOSITES_CRON_SECRET|CRON_SECRET/ }],
  ["demosites/claim/route.ts", { reason: "customer claim token", marker: /claim_token|readToken\(/ }],
  ["demosites/request/route.ts", { reason: "public demo request creates a time-limited claim token", marker: /claim_token|draft_preview/ }],
]);

const SERVICE_ROLE_PATTERNS = [
  /getSaasSupabase\(/,
  /getDemoSitesSupabase\(/,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /\[\["SUPABASE",\s*"SERVICE",\s*"ROLE",\s*"KEY"\]\.join\("_"\)\]/,
  /createClient\(/,
];

function routeFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const absolute = path.join(dir, entry);
      if (statSync(absolute).isDirectory()) return routeFiles(absolute);
      return entry === "route.ts" ? [absolute] : [];
    })
    .sort();
}

function relativeRoute(file: string) {
  return path.relative(API_ROOT, file).split(path.sep).join("/");
}

test("SaaS API routes with service-role access declare an auth boundary", () => {
  const failures: string[] = [];

  for (const file of routeFiles(API_ROOT)) {
    const source = readFileSync(file, "utf8");
    if (!SERVICE_ROLE_PATTERNS.some((pattern) => pattern.test(source))) continue;

    if (/requireAdminApi\(|verifyAdminSession\(/.test(source)) continue;

    const relative = relativeRoute(file);
    const exception = PUBLIC_OR_EXTERNALLY_AUTHED_ROUTES.get(relative);
    if (exception?.marker.test(source)) continue;

    failures.push(
      exception
        ? `${relative} is allowlisted for ${exception.reason}, but its expected boundary marker was not found`
        : `${relative} uses service-role access without an admin gate or explicit public/external boundary`,
    );
  }

  assert.deepEqual(failures, []);
});
