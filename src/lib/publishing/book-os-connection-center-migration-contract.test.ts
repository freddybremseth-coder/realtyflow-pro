import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260830150000_book_os_connection_center.sql"), "utf8");

test("connection center stores only validated non-secret website settings", () => {
  assert.match(sql, /create table public\.publishing_launch_channel_settings/);
  assert.match(sql, /target_url ~ '\^https:\/\/books\\\.freddybremseth\\\.com/);
  assert.match(sql, /publishing_set_launch_website_target/);
  assert.match(sql, /normalized <> 'https:\/\/books\.freddybremseth\.com'/);
  assert.doesNotMatch(sql, /\b(secret_ref|password|token_ciphertext)\s+(text|bytea)/i);
});

test("preflight uses canonical Meta, email and website connection sources", () => {
  assert.match(sql, /public\.social_channels sc join public\.oauth_tokens ot/);
  assert.match(sql, /public\.brand_email_configs/);
  assert.match(sql, /public\.publishing_launch_channel_settings/);
  assert.doesNotMatch(sql, /platform\s*=\s*'gmail'/i);
});

test("connection settings are service-only and cannot publish", () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.publishing_launch_channel_settings from public, anon, authenticated, service_role/);
  assert.match(sql, /external_publications_created',false/);
  assert.doesNotMatch(sql, /insert into public\.(marketing_publications|content_publications|publishing_distribution_)/i);
});
