import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = [
  "supabase/migrations/20260905195000_remaster_mediterranean_mix_jobs.sql",
  "supabase/migrations/20260905204500_remaster_mix_production_guard.sql",
].map((file) => path.join(repoRoot, file));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function databaseUrl() {
  const value = process.env.MIGRATION_TEST_DATABASE_URL;
  assert(value, "MIGRATION_TEST_DATABASE_URL is required.");
  assert(
    !process.env.SUPABASE_DB_URL && !process.env.POSTGRES_URL && !process.env.DATABASE_URL,
    "Refusing to run production guard test while production-style database URLs are set.",
  );
  const parsed = new URL(value);
  assert(
    ["localhost", "127.0.0.1", "::1", "postgres"].includes(parsed.hostname.toLowerCase()),
    `Refusing to run production guard test against non-local host ${parsed.hostname}`,
  );
  return value;
}

async function insertJob(client, targetMinutes, title) {
  const result = await client.query(
    `insert into public.remaster_mix_jobs (
      title, style, target_minutes, crossfade_seconds, playlist_name,
      zenecohomes_enabled, visual_region, visual_type, sponsor_interval_minutes,
      cta_text, track_ids, status, pipeline_step, queued_at
    ) values (
      $1, 'mediterranean-sunset', $2, 8, 'Mediterranean Sunset Deep House',
      true, 'north', 'mixed', 20, 'Explore Costa Blanca at ZenEcoHomes.com',
      array['track-a','track-b'], 'queued', 'queued', now()
    ) returning id`,
    [title, targetMinutes],
  );
  return result.rows[0].id;
}

async function main() {
  const client = new Client({ connectionString: databaseUrl(), application_name: "remaster_mix_guard_test" });
  await client.connect();
  try {
    await client.query("set statement_timeout='30s'");
    await client.query("drop schema if exists public cascade");
    await client.query("create schema public");
    await client.query("grant all on schema public to public");
    await client.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
    end $$;`);

    for (const migrationPath of migrations) {
      await client.query(await fs.readFile(migrationPath, "utf8"));
    }

    const longJobId = await insertJob(client, 120, "Two Hour Mix — must stay queued");
    const shortJobId = await insertJob(client, 30, "Thirty Minute Production Test");

    const claim = await client.query(
      `select * from public.claim_remaster_mix_job($1,$2)`,
      ["production-guard-worker", 300],
    );
    assert(claim.rowCount === 1, "Production worker must claim one eligible job.");
    assert(claim.rows[0].id === shortJobId, "Production worker must claim the 30-minute job, not the long draft.");
    assert(Number(claim.rows[0].target_minutes) === 30, "Claimed production job must be capped at 30 minutes.");

    const longJob = await client.query(`select status from public.remaster_mix_jobs where id=$1`, [longJobId]);
    assert(longJob.rows[0].status === "queued", "120-minute job must remain untouched by the production worker.");

    const lease = claim.rows[0].lease_token;
    await client.query(
      `select * from public.fail_remaster_mix_job($1,$2,$3,$4,$5)`,
      [shortJobId, lease, "TEST_STOP", "Stop after guard verification", false],
    );

    const noEligible = await client.query(
      `select * from public.claim_remaster_mix_job($1,$2)`,
      ["production-guard-worker-2", 300],
    );
    assert(noEligible.rowCount === 0, "Long queued mixes must remain unclaimable while the 30-minute production guard is active.");

    console.log("Re-Master Mediterranean Mix production guard: PASS");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
