import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260905195000_remaster_mediterranean_mix_jobs.sql",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function databaseUrl() {
  const value = process.env.MIGRATION_TEST_DATABASE_URL;
  assert(value, "MIGRATION_TEST_DATABASE_URL is required.");
  assert(
    !process.env.SUPABASE_DB_URL && !process.env.POSTGRES_URL && !process.env.DATABASE_URL,
    "Refusing to run mix migration test while production-style database URLs are set.",
  );

  const parsed = new URL(value);
  assert(
    ["localhost", "127.0.0.1", "::1", "postgres"].includes(parsed.hostname.toLowerCase()),
    `Refusing to run migration test against non-local host ${parsed.hostname}`,
  );
  return value;
}

async function insertQueuedJob(client, title) {
  const inserted = await client.query(
    `
      insert into public.remaster_mix_jobs (
        title,
        style,
        target_minutes,
        crossfade_seconds,
        playlist_name,
        zenecohomes_enabled,
        visual_region,
        visual_type,
        sponsor_interval_minutes,
        cta_text,
        track_ids,
        status,
        pipeline_step,
        queued_at
      ) values (
        $1,
        'mediterranean-sunset',
        120,
        8,
        'Mediterranean Sunset Deep House',
        true,
        'north',
        'villas',
        20,
        'Explore Costa Blanca at ZenEcoHomes.com',
        array['track-a','track-b'],
        'queued',
        'queued',
        now()
      )
      returning id
    `,
    [title],
  );
  return inserted.rows[0]?.id;
}

async function main() {
  const client = new Client({
    connectionString: databaseUrl(),
    application_name: "remaster_mix_migration_test",
  });
  await client.connect();

  try {
    await client.query("set statement_timeout='30s'");
    await client.query("drop schema if exists public cascade");
    await client.query("create schema public");
    await client.query("grant all on schema public to public");
    await client.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname='anon') then
          create role anon nologin;
        end if;
        if not exists (select 1 from pg_roles where rolname='authenticated') then
          create role authenticated nologin;
        end if;
        if not exists (select 1 from pg_roles where rolname='service_role') then
          create role service_role nologin;
        end if;
      end $$;
    `);

    const migration = await fs.readFile(migrationPath, "utf8");
    await client.query(migration);

    const table = await client.query(
      `select to_regclass('public.remaster_mix_jobs') as name`,
    );
    assert(
      table.rows[0]?.name === "remaster_mix_jobs",
      "remaster_mix_jobs table was not created.",
    );

    const privileges = await client.query(`
      select
        has_function_privilege(
          'anon',
          'public.claim_remaster_mix_job(text,integer)',
          'execute'
        ) as anon_claim,
        has_function_privilege(
          'authenticated',
          'public.claim_remaster_mix_job(text,integer)',
          'execute'
        ) as authenticated_claim,
        has_function_privilege(
          'service_role',
          'public.claim_remaster_mix_job(text,integer)',
          'execute'
        ) as service_claim,
        has_function_privilege(
          'service_role',
          'public.mark_remaster_mix_youtube_upload_started(uuid,uuid)',
          'execute'
        ) as service_upload_marker
    `);
    assert(privileges.rows[0]?.anon_claim === false, "anon must not execute claim.");
    assert(
      privileges.rows[0]?.authenticated_claim === false,
      "authenticated must not execute claim.",
    );
    assert(privileges.rows[0]?.service_claim === true, "service_role must execute claim.");
    assert(
      privileges.rows[0]?.service_upload_marker === true,
      "service_role must execute the YouTube upload marker.",
    );

    const jobId = await insertQueuedJob(client, "Mediterranean Sunset Mix #001");
    assert(jobId, "Test mix job was not inserted.");

    const claim1 = await client.query(
      `select * from public.claim_remaster_mix_job($1, $2)`,
      ["worker-a", 300],
    );
    assert(claim1.rowCount === 1, "First worker must claim exactly one queued job.");
    assert(claim1.rows[0].id === jobId, "Claimed the wrong mix job.");
    assert(claim1.rows[0].status === "running", "Claimed job must be running.");
    const lease1 = claim1.rows[0].lease_token;
    assert(lease1, "Claimed job must receive a lease token.");

    const claimWhileRunning = await client.query(
      `select * from public.claim_remaster_mix_job($1, $2)`,
      ["worker-b", 300],
    );
    assert(
      claimWhileRunning.rowCount === 0,
      "A leased running job must not be claimed by another worker.",
    );

    const heartbeat = await client.query(
      `select * from public.heartbeat_remaster_mix_job($1,$2,$3,$4,$5)`,
      [jobId, lease1, 300, "rendering_visuals", 55],
    );
    assert(heartbeat.rowCount === 1, "Heartbeat must return the leased job.");
    assert(
      heartbeat.rows[0].pipeline_step === "rendering_visuals",
      "Heartbeat must update pipeline step.",
    );
    assert(Number(heartbeat.rows[0].progress) === 55, "Heartbeat must update progress.");

    const failed = await client.query(
      `select * from public.fail_remaster_mix_job($1,$2,$3,$4,$5)`,
      [jobId, lease1, "TEST_RENDER_FAILURE", "Synthetic retryable render failure", true],
    );
    assert(
      failed.rows[0].status === "queued",
      "Retryable pre-upload failure must return the job to queued.",
    );
    assert(
      Number(failed.rows[0].retry_count) === 1,
      "Retryable failure must increment retry_count.",
    );

    const claim2 = await client.query(
      `select * from public.claim_remaster_mix_job($1, $2)`,
      ["worker-c", 300],
    );
    assert(claim2.rowCount === 1, "Retried job must be claimable again.");
    const lease2 = claim2.rows[0].lease_token;
    assert(lease2 && lease2 !== lease1, "Retry claim must receive a new lease token.");

    const uploadMarker = await client.query(
      `select * from public.mark_remaster_mix_youtube_upload_started($1,$2)`,
      [jobId, lease2],
    );
    assert(uploadMarker.rowCount === 1, "Upload marker must accept the active lease once.");
    assert(
      uploadMarker.rows[0].youtube_upload_started_at,
      "Upload marker must persist youtube_upload_started_at.",
    );

    const secondUploadMarker = await client.query(
      `select * from public.mark_remaster_mix_youtube_upload_started($1,$2)`,
      [jobId, lease2],
    );
    assert(
      secondUploadMarker.rowCount === 0,
      "The same job must never enter YouTube upload twice.",
    );

    const completed = await client.query(
      `select * from public.complete_remaster_mix_job($1,$2,$3,$4)`,
      [jobId, lease2, "youtube-test-id", "https://www.youtube.com/watch?v=youtube-test-id"],
    );
    assert(completed.rows[0].status === "completed", "Verified upload must complete the job.");
    assert(Number(completed.rows[0].progress) === 100, "Completed mix must have progress 100.");
    assert(
      completed.rows[0].youtube_video_id === "youtube-test-id",
      "Completed mix must persist YouTube id.",
    );
    assert(completed.rows[0].lease_token === null, "Completed mix must clear the lease token.");

    const noMoreWork = await client.query(
      `select * from public.claim_remaster_mix_job($1, $2)`,
      ["worker-d", 300],
    );
    assert(noMoreWork.rowCount === 0, "Completed mix must never be claimed again.");

    const ambiguousJobId = await insertQueuedJob(
      client,
      "Mediterranean Sunset Mix #002 — Ambiguity Guard",
    );
    const ambiguousClaim = await client.query(
      `select * from public.claim_remaster_mix_job($1, $2)`,
      ["worker-e", 300],
    );
    const ambiguousLease = ambiguousClaim.rows[0]?.lease_token;
    assert(
      ambiguousClaim.rows[0]?.id === ambiguousJobId && ambiguousLease,
      "Ambiguity test job must be claimed.",
    );

    await client.query(
      `select * from public.mark_remaster_mix_youtube_upload_started($1,$2)`,
      [ambiguousJobId, ambiguousLease],
    );
    const ambiguousFailure = await client.query(
      `select * from public.fail_remaster_mix_job($1,$2,$3,$4,$5)`,
      [
        ambiguousJobId,
        ambiguousLease,
        "TEST_YOUTUBE_TIMEOUT",
        "Synthetic timeout after YouTube upload started",
        true,
      ],
    );
    assert(
      ambiguousFailure.rows[0].status === "failed",
      "A failure after upload starts must be terminal, even when marked retryable.",
    );

    await client.query(
      `update public.remaster_mix_jobs set status='queued', pipeline_step='queued' where id=$1`,
      [ambiguousJobId],
    );
    const forcedRequeueClaim = await client.query(
      `select * from public.claim_remaster_mix_job($1, $2)`,
      ["worker-f", 300],
    );
    assert(
      forcedRequeueClaim.rowCount === 0,
      "Database claim guard must reject even a manually forced ambiguous requeue.",
    );

    console.log("Re-Master Mediterranean Mix migration integration: PASS");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
