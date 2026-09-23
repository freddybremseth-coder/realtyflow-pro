import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = [
  "supabase/migrations/20260905195000_remaster_mediterranean_mix_jobs.sql",
  "supabase/migrations/20260905204500_remaster_mix_production_guard.sql",
  "supabase/migrations/20260923190500_remaster_mix_short_duration.sql",
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

    // New owner-facing production range is 3–30 minutes; there are no 60–180
    // minute drafts in the new API contract.
    const threeMinuteId = await insertJob(client, 3, "Three Minute Smoke Mix");
    const thirtyMinuteId = await insertJob(client, 30, "Thirty Minute Production Mix");

    for (const invalid of [2,31,60,120]) {
      let rejected = false;
      try { await insertJob(client, invalid, "Invalid "+invalid+" Minute Mix"); }
      catch { rejected = true; }
      assert(rejected, "target_minutes="+invalid+" must be rejected by the 3–30 minute database guard.");
    }

    const oneTrack = await client.query(
      `insert into public.remaster_mix_jobs (
        title,style,target_minutes,crossfade_seconds,playlist_name,
        zenecohomes_enabled,visual_region,visual_type,sponsor_interval_minutes,
        track_ids,status,pipeline_step,queued_at
      ) values (
        'One Track Short Mix','morning-chill',5,0,'Short Mixes',
        false,'any','mixed',10,array['track-a'],'queued','queued',now()
      ) returning id`,
    );
    assert(oneTrack.rowCount===1,"A 3–30 minute short mix may intentionally use one song.");

    const first = await client.query(
      `select * from public.claim_remaster_mix_job($1,$2)`,
      ["production-guard-worker",300],
    );
    assert(first.rowCount===1,"Production worker must claim a valid short mix.");
    assert(first.rows[0].id===threeMinuteId,"Queue order must preserve the first 3-minute mix.");
    assert(Number(first.rows[0].target_minutes)===3,"Worker must accept 3-minute production.");

    await client.query(
      `select * from public.fail_remaster_mix_job($1,$2,$3,$4,$5)`,
      [threeMinuteId,first.rows[0].lease_token,"TEST_STOP","Stop after 3-minute verification",false],
    );

    const second = await client.query(
      `select * from public.claim_remaster_mix_job($1,$2)`,
      ["production-guard-worker-2",300],
    );
    assert(second.rowCount===1,"Production worker must continue to another valid 3–30 minute job.");
    assert(second.rows[0].id===thirtyMinuteId,"The 30-minute job remains supported.");
    assert(Number(second.rows[0].target_minutes)===30,"30-minute production remains valid.");

    console.log("Re-Master 3–30 minute Mix production guard: PASS");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
