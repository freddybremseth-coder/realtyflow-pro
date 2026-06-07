import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationFiles = {
  growthActionsFingerprint: path.join(
    repoRoot,
    "supabase/migrations/20260607145900_growth_actions_remaster_fingerprint_index.sql",
  ),
  userImageBankContract: path.join(
    repoRoot,
    "supabase/migrations/20260607145538_remaster_user_image_bank_contract.sql",
  ),
  remasterJobCore: path.join(
    repoRoot,
    "supabase/migrations/20260607173023_remaster_pipeline_jobs_core.sql",
  ),
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getDatabaseUrl() {
  const url = process.env.MIGRATION_TEST_DATABASE_URL;

  assert(
    url,
    "MIGRATION_TEST_DATABASE_URL is required and must point to an isolated test database.",
  );
  assert(
    !process.env.SUPABASE_DB_URL && !process.env.POSTGRES_URL && !process.env.DATABASE_URL,
    "Refusing to run migration tests while production-style database URL environment variables are set.",
  );

  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  assert(
    ["localhost", "127.0.0.1", "::1", "postgres"].includes(host),
    `Refusing to run migration tests against non-local host: ${host}`,
  );

  return url;
}

async function withClient(fn) {
  const client = new Client({
    connectionString: getDatabaseUrl(),
    application_name: "remaster_migration_integration",
  });

  await client.connect();
  try {
    await client.query("set statement_timeout = '30s'");
    await client.query("set lock_timeout = '5s'");
    await fn(client);
  } finally {
    await client.end();
  }
}

async function createTestClient() {
  const client = new Client({
    connectionString: getDatabaseUrl(),
    application_name: "remaster_migration_integration_parallel",
  });
  await client.connect();
  await client.query("set statement_timeout = '30s'");
  await client.query("set lock_timeout = '5s'");
  return client;
}

async function resetPublicSchema(client) {
  await client.query("drop schema if exists public cascade");
  await client.query("create schema public");
  await client.query("grant all on schema public to public");
}

async function assertRejectsQuery(client, sql, message) {
  let rejected = false;
  try {
    await client.query(sql);
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

async function applyMigration(client, filePath) {
  const sql = await fs.readFile(filePath, "utf8");
  await client.query(sql);
}

async function getIndexDetails(client, indexName) {
  const { rows } = await client.query(
    `
      select
        i.indisunique,
        pg_get_indexdef(i.indexrelid) as indexdef,
        pg_get_expr(i.indpred, i.indrelid) as predicate,
        json_agg(a.attname order by ord.ordinality)::text as columns_json
      from pg_class idx
      join pg_index i on i.indexrelid = idx.oid
      join pg_class tbl on tbl.oid = i.indrelid
      join unnest(i.indkey) with ordinality as ord(attnum, ordinality) on true
      join pg_attribute a on a.attrelid = tbl.oid and a.attnum = ord.attnum
      where idx.relname = $1
        and tbl.relnamespace = 'public'::regnamespace
      group by i.indisunique, i.indexrelid, i.indrelid
    `,
    [indexName],
  );

  assert(rows.length === 1, `Expected exactly one ${indexName} index, found ${rows.length}.`);
  return rows[0];
}

async function getColumns(client, tableName) {
  const { rows } = await client.query(
    `
      select
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position
    `,
    [tableName],
  );

  return new Map(rows.map((row) => [row.column_name, row]));
}

async function getTableConstraints(client, tableName) {
  const { rows } = await client.query(
    `
      select
        conname,
        contype,
        convalidated,
        pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conrelid = format('public.%I', $1::text)::regclass
      order by conname
    `,
    [tableName],
  );

  return new Map(rows.map((row) => [row.conname, row]));
}

async function assertColumn(columns, name, expected) {
  const column = columns.get(name);
  assert(column, `Missing column public.user_image_bank.${name}.`);
  for (const [key, value] of Object.entries(expected)) {
    assert(
      column[key] === value,
      `Unexpected ${name}.${key}: expected ${value}, got ${column[key]}.`,
    );
  }
  return column;
}

async function assertNoOpenUserImageBankPolicy(client) {
  const { rows } = await client.query(`
    select count(*)::int as count
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_image_bank'
      and (
        lower(coalesce(qual, '')) in ('true', '(true)')
        or lower(coalesce(with_check, '')) in ('true', '(true)')
      )
  `);
  assert(rows[0].count === 0, "Migration must not create an open user_image_bank policy.");
}

async function verifyUserImageBankContract(client, { expectStrict = true } = {}) {
  const { rows: tableRows } = await client.query(
    "select to_regclass('public.user_image_bank') as table_name",
  );
  assert(tableRows[0].table_name === "user_image_bank", "public.user_image_bank is missing.");

  const columns = await getColumns(client, "user_image_bank");
  await assertColumn(columns, "id", { data_type: "uuid" });
  await assertColumn(columns, "owner", { data_type: "text" });
  await assertColumn(columns, "url", { data_type: "text" });
  await assertColumn(columns, "thumbnail_url", { data_type: "text" });
  await assertColumn(columns, "name", { data_type: "text" });
  await assertColumn(columns, "kind", { data_type: "text" });
  await assertColumn(columns, "tags", { data_type: "ARRAY", udt_name: "_text" });
  await assertColumn(columns, "size_bytes", { data_type: "bigint" });
  await assertColumn(columns, "width", { data_type: "integer" });
  await assertColumn(columns, "height", { data_type: "integer" });
  await assertColumn(columns, "created_at", { data_type: "timestamp with time zone" });
  await assertColumn(columns, "last_used_at", { data_type: "timestamp with time zone" });
  await assertColumn(columns, "use_count", { data_type: "integer" });
  await assertColumn(columns, "archive_status", { data_type: "text" });
  await assertColumn(columns, "archive_destination", { data_type: "text" });
  await assertColumn(columns, "archived_at", { data_type: "timestamp with time zone" });

  assert(columns.get("id").column_default?.includes("gen_random_uuid()"), "id default is missing.");
  assert(columns.get("owner").column_default?.includes("'system'"), "owner default is missing.");
  assert(columns.get("kind").column_default?.includes("'image'"), "kind default is missing.");
  assert(columns.get("tags").column_default?.includes("'{}'"), "tags default is missing.");
  assert(columns.get("created_at").column_default?.includes("now()"), "created_at default is missing.");
  assert(columns.get("use_count").column_default?.includes("0"), "use_count default is missing.");
  assert(
    columns.get("archive_status").column_default?.includes("'active'"),
    "archive_status default is missing.",
  );

  if (expectStrict) {
    for (const name of ["id", "owner", "url", "kind", "tags", "created_at", "use_count", "archive_status"]) {
      assert(
        columns.get(name).is_nullable === "NO",
        `Expected ${name} to be NOT NULL in compatible schema.`,
      );
    }
  }

  const constraints = await getTableConstraints(client, "user_image_bank");
  if (expectStrict) {
    assert(constraints.get("user_image_bank_pkey")?.contype === "p", "Primary key is missing.");
  }
  assert(
    constraints.get("user_image_bank_kind_check")?.definition.includes(
      "kind = ANY (ARRAY['image'::text, 'logo'::text, 'thumbnail'::text, 'product'::text, 'variant'::text])",
    ) || constraints.get("user_image_bank_kind_check")?.definition.includes("kind IN"),
    "kind check constraint is missing.",
  );
  assert(
    constraints.get("user_image_bank_use_count_check")?.definition.includes("use_count >= 0"),
    "use_count check constraint is missing.",
  );

  const expectedIndexes = [
    "idx_user_image_bank_owner",
    "idx_user_image_bank_kind",
    "idx_user_image_bank_created_at",
    "idx_user_image_bank_owner_kind_created",
  ];
  const { rows: indexRows } = await client.query(
    "select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'user_image_bank'",
  );
  const indexNames = new Set(indexRows.map((row) => row.indexname));
  for (const indexName of expectedIndexes) {
    assert(indexNames.has(indexName), `Missing index ${indexName}.`);
  }
  assert(
    indexRows
      .find((row) => row.indexname === "idx_user_image_bank_owner_kind_created")
      ?.indexdef.includes("(owner, kind, created_at DESC)"),
    "Composite owner/kind/created_at index has unexpected definition.",
  );

  const { rows: rlsRows } = await client.query(
    "select relrowsecurity from pg_class where oid = 'public.user_image_bank'::regclass",
  );
  assert(rlsRows[0].relrowsecurity === true, "RLS is not enabled on user_image_bank.");
  await assertNoOpenUserImageBankPolicy(client);
}

async function testGrowthActionsFingerprintIndex() {
  await withClient(async (client) => {
    await resetPublicSchema(client);
    await client.query(`
      create table public.growth_actions (
        id integer generated by default as identity primary key,
        brand text,
        platform text,
        hypothesis text
      )
    `);
    await client.query(
      `
        insert into public.growth_actions (brand, platform, hypothesis)
        values
          ('realtyflow', 'youtube', 'existing non-remaster action'),
          ('remasterfreddy', 'instagram', 'wrong platform'),
          ('remasterfreddy', 'youtube', null),
          ('remasterfreddy', 'youtube', 'fingerprint-1')
      `,
    );

    await applyMigration(client, migrationFiles.growthActionsFingerprint);

    const index = await getIndexDetails(client, "idx_growth_actions_remaster_fingerprint");
    assert(index.indisunique === false, "Fingerprint index must not be unique.");
    const indexColumns = JSON.parse(index.columns_json);
    assert(
      JSON.stringify(indexColumns) === JSON.stringify(["brand", "platform", "hypothesis"]),
      `Unexpected index columns: ${JSON.stringify(indexColumns)}`,
    );
    assert(
      index.predicate.includes("(brand = 'remasterfreddy'::text)") &&
        index.predicate.includes("(platform = 'youtube'::text)") &&
        index.predicate.includes("(hypothesis IS NOT NULL)"),
      `Unexpected partial index predicate: ${index.predicate}`,
    );

    await applyMigration(client, migrationFiles.growthActionsFingerprint);

    const { rows: duplicateIndexRows } = await client.query(
      "select count(*)::int as count from pg_class where relname = 'idx_growth_actions_remaster_fingerprint'",
    );
    assert(
      duplicateIndexRows[0].count === 1,
      `Expected idempotent migration to keep one index, found ${duplicateIndexRows[0].count}.`,
    );

    await client.query("drop index if exists public.idx_growth_actions_remaster_fingerprint");
    const { rows: rollbackRows } = await client.query(
      "select to_regclass('public.idx_growth_actions_remaster_fingerprint') as index_name",
    );
    assert(rollbackRows[0].index_name === null, "Rollback did not remove the fingerprint index.");
  });
}

async function testUserImageBankContract() {
  await withClient(async (client) => {
    process.stdout.write("  Scenario: empty database\n");
    await resetPublicSchema(client);
    await applyMigration(client, migrationFiles.userImageBankContract);
    await verifyUserImageBankContract(client);

    process.stdout.write("  Scenario: partial legacy table\n");
    await resetPublicSchema(client);
    await client.query("create extension if not exists pgcrypto");
    await client.query(`
      create table public.user_image_bank (
        id uuid default gen_random_uuid(),
        owner text,
        url text,
        kind text default 'image',
        created_at timestamptz default now()
      )
    `);
    await client.query(`
      insert into public.user_image_bank (owner, url, kind)
      values ('legacy-owner', 'https://example.test/legacy.png', 'logo')
    `);
    await applyMigration(client, migrationFiles.userImageBankContract);
    await verifyUserImageBankContract(client);
    const { rows: legacyRows } = await client.query(
      "select owner, url, kind, use_count from public.user_image_bank",
    );
    assert(legacyRows.length === 1, "Partial legacy table row was not preserved.");
    assert(legacyRows[0].owner === "legacy-owner", "Partial legacy row owner changed.");
    assert(legacyRows[0].url === "https://example.test/legacy.png", "Partial legacy row URL changed.");
    assert(legacyRows[0].kind === "logo", "Partial legacy row kind changed.");
    assert(legacyRows[0].use_count === 0, "Missing use_count column was not backfilled by default.");

    process.stdout.write("  Scenario: production-like table\n");
    await resetPublicSchema(client);
    await client.query("create extension if not exists pgcrypto");
    await client.query(`
      create table public.user_image_bank (
        id uuid primary key default gen_random_uuid(),
        owner text not null default 'system',
        url text not null,
        thumbnail_url text,
        name text,
        kind text not null default 'image',
        tags text[] not null default '{}',
        size_bytes bigint,
        width integer,
        height integer,
        created_at timestamptz not null default now(),
        last_used_at timestamptz,
        use_count integer not null default 0,
        archive_status text not null default 'active',
        archive_destination text,
        archived_at timestamptz,
        constraint user_image_bank_kind_check check (kind in ('image', 'logo', 'thumbnail', 'product', 'variant')),
        constraint user_image_bank_use_count_check check (use_count >= 0)
      )
    `);
    await client.query("create index idx_user_image_bank_owner on public.user_image_bank (owner)");
    await client.query("create index idx_user_image_bank_kind on public.user_image_bank (kind)");
    await client.query("create index idx_user_image_bank_created_at on public.user_image_bank (created_at desc)");
    await client.query(
      "create index idx_user_image_bank_owner_kind_created on public.user_image_bank (owner, kind, created_at desc)",
    );
    await client.query("alter table public.user_image_bank enable row level security");
    const beforeProductionColumns = await getColumns(client, "user_image_bank");
    await applyMigration(client, migrationFiles.userImageBankContract);
    await verifyUserImageBankContract(client);
    const afterProductionColumns = await getColumns(client, "user_image_bank");
    assert(
      JSON.stringify([...beforeProductionColumns.keys()]) === JSON.stringify([...afterProductionColumns.keys()]),
      "Production-like table columns changed unexpectedly.",
    );

    process.stdout.write("  Scenario: idempotence\n");
    await applyMigration(client, migrationFiles.userImageBankContract);
    await verifyUserImageBankContract(client);

    process.stdout.write("  Scenario: incompatible existing data\n");
    await resetPublicSchema(client);
    await client.query("create extension if not exists pgcrypto");
    await client.query(`
      create table public.user_image_bank (
        id uuid,
        owner text,
        url text,
        kind text,
        tags text[],
        created_at timestamptz,
        use_count integer,
        archive_status text
      )
    `);
    await client.query(`
      with duplicate as (select gen_random_uuid() as id)
      insert into public.user_image_bank (id, owner, url, kind, tags, created_at, use_count, archive_status)
      select id, 'duplicate-a', 'https://example.test/a.png', 'image', '{}'::text[], now(), 0, 'active' from duplicate
      union all
      select id, 'duplicate-b', 'https://example.test/b.png', 'logo', '{}'::text[], now(), 0, 'active' from duplicate
      union all
      select gen_random_uuid(), 'bad-kind', 'https://example.test/bad-kind.png', 'poster', '{}'::text[], now(), 0, 'active'
      union all
      select gen_random_uuid(), 'negative-count', 'https://example.test/negative.png', 'thumbnail', '{}'::text[], now(), -1, 'active'
      union all
      select null::uuid, null::text, null::text, null::text, null::text[], null::timestamptz, null::integer, null::text
    `);
    await applyMigration(client, migrationFiles.userImageBankContract);
    await verifyUserImageBankContract(client, { expectStrict: false });
    const { rows: incompatibleRows } = await client.query(
      "select count(*)::int as count from public.user_image_bank",
    );
    assert(incompatibleRows[0].count === 5, "Incompatible rows were deleted or rewritten.");
    const incompatibleConstraints = await getTableConstraints(client, "user_image_bank");
    assert(
      incompatibleConstraints.get("user_image_bank_kind_check")?.convalidated === false,
      "kind check should remain NOT VALID when incompatible kind values exist.",
    );
    assert(
      incompatibleConstraints.get("user_image_bank_use_count_check")?.convalidated === false,
      "use_count check should remain NOT VALID when negative values exist.",
    );
    assert(
      !incompatibleConstraints.has("user_image_bank_pkey"),
      "Primary key should not be added when null or duplicate IDs exist.",
    );
  });
}

async function insertRemasterJob(client, overrides = {}) {
  const job = {
    brand: "remasterfreddy",
    song_id: `song-${Math.random().toString(36).slice(2)}`,
    status: "queued",
    pipeline_step: "pending",
    input_version: "input-v1",
    input_config: { test: true },
    idempotency_key: `remaster_pipeline:${Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64)}`,
    retry_count: 0,
    max_retries: 3,
    retry_classification: "unknown",
    ...overrides,
  };

  const { rows } = await client.query(
    `
      insert into public.remaster_pipeline_jobs (
        brand,
        song_id,
        status,
        pipeline_step,
        input_version,
        input_config,
        idempotency_key,
        retry_count,
        max_retries,
        retry_classification,
        next_retry_at,
        lease_token,
        lease_owner,
        lease_expires_at,
        youtube_upload_started_at,
        youtube_video_id,
        youtube_url
      )
      values (
        $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
      returning *
    `,
    [
      job.brand,
      job.song_id,
      job.status,
      job.pipeline_step,
      job.input_version,
      JSON.stringify(job.input_config),
      job.idempotency_key,
      job.retry_count,
      job.max_retries,
      job.retry_classification,
      job.next_retry_at || null,
      job.lease_token || null,
      job.lease_owner || null,
      job.lease_expires_at || null,
      job.youtube_upload_started_at || null,
      job.youtube_video_id || null,
      job.youtube_url || null,
    ],
  );
  return rows[0];
}

async function verifyRemasterJobCoreContract(client) {
  const jobColumns = await getColumns(client, "remaster_pipeline_jobs");
  for (const [name, expected] of Object.entries({
    id: { data_type: "uuid" },
    brand: { data_type: "text" },
    song_id: { data_type: "text" },
    status: { data_type: "text" },
    pipeline_step: { data_type: "text" },
    progress: { data_type: "integer" },
    input_version: { data_type: "text" },
    input_config: { data_type: "jsonb" },
    idempotency_key: { data_type: "text" },
    retry_count: { data_type: "integer" },
    max_retries: { data_type: "integer" },
    retry_classification: { data_type: "text" },
    next_retry_at: { data_type: "timestamp with time zone" },
    lease_token: { data_type: "uuid" },
    lease_owner: { data_type: "text" },
    lease_expires_at: { data_type: "timestamp with time zone" },
    heartbeat_at: { data_type: "timestamp with time zone" },
    youtube_upload_started_at: { data_type: "timestamp with time zone" },
    youtube_video_id: { data_type: "text" },
    youtube_url: { data_type: "text" },
    manual_review_required: { data_type: "boolean" },
    created_at: { data_type: "timestamp with time zone" },
    updated_at: { data_type: "timestamp with time zone" },
  })) {
    await assertColumn(jobColumns, name, expected);
  }

  const eventColumns = await getColumns(client, "remaster_pipeline_job_events");
  for (const [name, expected] of Object.entries({
    id: { data_type: "uuid" },
    job_id: { data_type: "uuid" },
    event_sequence: { data_type: "bigint" },
    event_type: { data_type: "text" },
    level: { data_type: "text" },
    status: { data_type: "text" },
    pipeline_step: { data_type: "text" },
    details: { data_type: "jsonb" },
    created_at: { data_type: "timestamp with time zone" },
  })) {
    await assertColumn(eventColumns, name, expected);
  }

  const jobConstraints = await getTableConstraints(client, "remaster_pipeline_jobs");
  for (const constraintName of [
    "remaster_pipeline_jobs_status_check",
    "remaster_pipeline_jobs_step_check",
    "remaster_pipeline_jobs_retry_classification_check",
    "remaster_pipeline_jobs_progress_check",
    "remaster_pipeline_jobs_retry_count_check",
    "remaster_pipeline_jobs_youtube_url_check",
  ]) {
    assert(jobConstraints.has(constraintName), `Missing ${constraintName}.`);
  }

  const { rows: indexRows } = await client.query(
    "select indexname from pg_indexes where schemaname = 'public' and tablename = 'remaster_pipeline_jobs'",
  );
  const indexNames = new Set(indexRows.map((row) => row.indexname));
  for (const indexName of [
    "idx_remaster_pipeline_jobs_active_idempotency",
    "idx_remaster_pipeline_jobs_status_created",
    "idx_remaster_pipeline_jobs_brand_song_created",
    "idx_remaster_pipeline_jobs_lease",
  ]) {
    assert(indexNames.has(indexName), `Missing ${indexName}.`);
  }

  const { rows: rlsRows } = await client.query(`
    select relname, relrowsecurity
    from pg_class
    where oid in ('public.remaster_pipeline_jobs'::regclass, 'public.remaster_pipeline_job_events'::regclass)
    order by relname
  `);
  assert(rlsRows.every((row) => row.relrowsecurity === true), "RLS is not enabled for all job tables.");

  const { rows: policyRows } = await client.query(`
    select count(*)::int as count
    from pg_policies
    where schemaname = 'public'
      and tablename in ('remaster_pipeline_jobs', 'remaster_pipeline_job_events')
      and (
        lower(coalesce(qual, '')) in ('true', '(true)')
        or lower(coalesce(with_check, '')) in ('true', '(true)')
      )
  `);
  assert(policyRows[0].count === 0, "Migration must not create open Re-Master job policies.");
}

async function testRemasterJobCore() {
  await withClient(async (client) => {
    process.stdout.write("  Scenario: empty database\n");
    await resetPublicSchema(client);
    await applyMigration(client, migrationFiles.remasterJobCore);
    await verifyRemasterJobCoreContract(client);

    process.stdout.write("  Scenario: idempotence\n");
    await applyMigration(client, migrationFiles.remasterJobCore);
    await verifyRemasterJobCoreContract(client);

    process.stdout.write("  Scenario: constraints\n");
    await assertRejectsQuery(
      client,
      `
        insert into public.remaster_pipeline_jobs (
          song_id,
          status,
          pipeline_step,
          input_version,
          idempotency_key
        )
        values ('song-invalid', 'render_video', 'pending', 'v1', 'remaster_pipeline:invalid')
      `,
      "Invalid lifecycle status was accepted.",
    );
    await assertRejectsQuery(
      client,
      `
        insert into public.remaster_pipeline_jobs (
          song_id,
          status,
          pipeline_step,
          input_version,
          idempotency_key,
          progress
        )
        values ('song-invalid', 'queued', 'pending', 'v1', 'remaster_pipeline:invalid-progress', 120)
      `,
      "Invalid progress was accepted.",
    );

    process.stdout.write("  Scenario: active duplicate protection\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const duplicateKey = "remaster_pipeline:" + "a".repeat(64);
    await insertRemasterJob(client, { idempotency_key: duplicateKey, status: "queued" });
    await assertRejectsQuery(
      client,
      `
        insert into public.remaster_pipeline_jobs (song_id, input_version, idempotency_key)
        values ('song-duplicate', 'v1', '${duplicateKey}')
      `,
      "Active duplicate idempotency key was accepted.",
    );
    await client.query("update public.remaster_pipeline_jobs set status = 'completed' where idempotency_key = $1", [
      duplicateKey,
    ]);
    await insertRemasterJob(client, { idempotency_key: duplicateKey, status: "queued" });

    process.stdout.write("  Scenario: concurrent claimers\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const claimable = await insertRemasterJob(client);
    const firstClient = await createTestClient();
    const secondClient = await createTestClient();
    try {
      const [first, second] = await Promise.all([
        firstClient.query("select * from public.claim_remaster_pipeline_job('worker-a')"),
        secondClient.query("select * from public.claim_remaster_pipeline_job('worker-b')"),
      ]);
      const totalClaims = first.rows.length + second.rows.length;
      assert(totalClaims === 1, `Expected one concurrent claim, got ${totalClaims}.`);
      const claimed = first.rows[0] || second.rows[0];
      assert(claimed.id === claimable.id, "Concurrent claim returned the wrong job.");

      process.stdout.write("  Scenario: lease token required\n");
      const wrongHeartbeat = await client.query(
        "select * from public.heartbeat_remaster_pipeline_job($1, $2::uuid)",
        [claimed.id, "00000000-0000-0000-0000-000000000000"],
      );
      assert(wrongHeartbeat.rows.length === 0, "Heartbeat succeeded with the wrong lease token.");
      const correctHeartbeat = await client.query(
        "select * from public.heartbeat_remaster_pipeline_job($1, $2::uuid)",
        [claimed.id, claimed.lease_token],
      );
      assert(correctHeartbeat.rows.length === 1, "Heartbeat failed with the correct lease token.");
    } finally {
      await firstClient.end();
      await secondClient.end();
    }

    process.stdout.write("  Scenario: lease expiry recovery\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const expiredJob = await insertRemasterJob(client, {
      status: "running",
      lease_owner: "expired-worker",
      lease_token: "11111111-1111-1111-1111-111111111111",
      lease_expires_at: "2026-01-01T00:00:00.000Z",
    });
    const recovered = await client.query("select * from public.claim_remaster_pipeline_job('recovery-worker')");
    assert(recovered.rows[0]?.id === expiredJob.id, "Expired safe lease was not recovered.");

    process.stdout.write("  Scenario: retry limit\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    await insertRemasterJob(client, {
      status: "waiting_retry",
      retry_count: 3,
      max_retries: 3,
      next_retry_at: "2026-01-01T00:00:00.000Z",
    });
    const retryLimited = await client.query("select * from public.claim_remaster_pipeline_job('retry-worker')");
    assert(retryLimited.rows.length === 0, "Retry-limited job was claimed.");
    const retryable = await insertRemasterJob(client, {
      status: "waiting_retry",
      retry_count: 1,
      max_retries: 3,
      next_retry_at: "2026-01-01T00:00:00.000Z",
    });
    const retryClaim = await client.query("select * from public.claim_remaster_pipeline_job('retry-worker')");
    assert(retryClaim.rows[0]?.id === retryable.id, "Retryable waiting job was not claimed.");

    process.stdout.write("  Scenario: ambiguous YouTube upload is not auto-claimed\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    await insertRemasterJob(client, {
      status: "running",
      lease_owner: "expired-uploader",
      lease_token: "22222222-2222-2222-2222-222222222222",
      lease_expires_at: "2026-01-01T00:00:00.000Z",
      youtube_upload_started_at: "2026-06-07T10:00:00.000Z",
    });
    const ambiguousClaim = await client.query("select * from public.claim_remaster_pipeline_job('safe-worker')");
    assert(ambiguousClaim.rows.length === 0, "Ambiguous YouTube upload was auto-claimed.");

    process.stdout.write("  Scenario: YouTube ID can resume without re-upload decision\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const uploadedJob = await insertRemasterJob(client, {
      status: "running",
      lease_owner: "expired-uploader",
      lease_token: "33333333-3333-3333-3333-333333333333",
      lease_expires_at: "2026-01-01T00:00:00.000Z",
      youtube_upload_started_at: "2026-06-07T10:00:00.000Z",
      youtube_video_id: "yt-123",
      youtube_url: "https://youtube.com/watch?v=yt-123",
    });
    const uploadedClaim = await client.query("select * from public.claim_remaster_pipeline_job('resume-worker')");
    assert(uploadedClaim.rows[0]?.id === uploadedJob.id, "Job with stored YouTube ID could not resume.");

    process.stdout.write("  Scenario: event order\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const eventJob = await insertRemasterJob(client);
    await client.query(
      "select public.append_remaster_pipeline_job_event($1, 'step_started', 'info', 'running', 'download_audio', 'Download started', '{}'::jsonb)",
      [eventJob.id],
    );
    await client.query(
      "select public.append_remaster_pipeline_job_event($1, 'step_completed', 'info', 'running', 'download_audio', 'Download completed', '{}'::jsonb)",
      [eventJob.id],
    );
    const events = await client.query(
      "select event_type, event_sequence from public.remaster_pipeline_job_events where job_id = $1 order by event_sequence",
      [eventJob.id],
    );
    assert(
      JSON.stringify(events.rows.map((row) => row.event_type)) === JSON.stringify(["step_started", "step_completed"]),
      "Events are not ordered by durable sequence.",
    );
    assert(events.rows[0].event_sequence < events.rows[1].event_sequence, "Event sequence did not increase.");
  });
}

const tests = new Map([
  ["growth-actions-fingerprint", testGrowthActionsFingerprintIndex],
  ["user-image-bank-contract", testUserImageBankContract],
  ["remaster-job-core", testRemasterJobCore],
]);

async function main() {
  const requested = process.argv.slice(2);
  const testNames = requested.length > 0 ? requested : [...tests.keys()];

  for (const testName of testNames) {
    const test = tests.get(testName);
    assert(test, `Unknown migration test: ${testName}`);
    process.stdout.write(`Running migration test: ${testName}\n`);
    await test();
    process.stdout.write(`Passed migration test: ${testName}\n`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Migration integration test failed.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
