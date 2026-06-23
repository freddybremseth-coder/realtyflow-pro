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
  leadIntelligencePersistence: path.join(
    repoRoot,
    "supabase/migrations/20260614164309_lead_intelligence_persistence_foundation.sql",
  ),
  leadIntelligenceRuntimeRls: path.join(
    repoRoot,
    "supabase/migrations/20260617130114_lead_intelligence_runtime_rls.sql",
  ),
  leadIntelligenceContactLinkGate: path.join(
    repoRoot,
    "supabase/migrations/20260623120717_lead_intelligence_contact_link_gate.sql",
  ),
  leadIntelligenceProfileActions: path.join(
    repoRoot,
    "supabase/migrations/20260623153545_lead_intelligence_profile_actions.sql",
  ),
  leadIntelligenceCrmContext: path.join(
    repoRoot,
    "supabase/migrations/20260622103729_lead_intelligence_crm_context_readonly.sql",
  ),
  leadIntelligenceShortlistDraft: path.join(
    repoRoot,
    "supabase/migrations/20260621161521_lead_intelligence_shortlist_draft.sql",
  ),
  leadIntelligencePresentationDraft: path.join(
    repoRoot,
    "supabase/migrations/20260621191609_lead_intelligence_presentation_draft.sql",
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

async function ensureSupabaseTestRoles(client) {
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;

      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;

      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin;
      end if;
    end $$;
  `);
}

async function assertRejectsQuery(client, sql, message, expectedMessage) {
  let rejected = false;
  try {
    await client.query(sql);
  } catch (error) {
    rejected = true;
    if (expectedMessage) {
      assert(
        error instanceof Error && error.message.includes(expectedMessage),
        `${message} Expected error message to include ${expectedMessage}.`,
      );
    }
  }
  assert(rejected, message);
}

async function applyMigration(client, filePath) {
  const sql = await fs.readFile(filePath, "utf8");
  await client.query(sql);
}

async function applyMigrationAsRole(client, filePath, roleName) {
  const sql = await fs.readFile(filePath, "utf8");
  await client.query("reset role");
  try {
    await client.query(`set role ${roleName}`);
    await client.query(sql);
  } finally {
    await client.query("reset role");
  }
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
    cancel_requested_at: null,
    manual_review_required: false,
    manual_review_reason: null,
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
        cancel_requested_at,
        youtube_upload_started_at,
        youtube_video_id,
        youtube_url,
        manual_review_required,
        manual_review_reason
      )
      values (
        $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
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
      job.cancel_requested_at || null,
      job.youtube_upload_started_at || null,
      job.youtube_video_id || null,
      job.youtube_url || null,
      job.manual_review_required,
      job.manual_review_reason || null,
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
    cancel_requested_at: { data_type: "timestamp with time zone" },
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
    message: { data_type: "text" },
    details: { data_type: "jsonb" },
    correlation_id: { data_type: "uuid" },
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

  await verifyRemasterJobFunctionPrivileges(client);
}

async function verifyRemasterJobFunctionPrivileges(client) {
  const { rows } = await client.query(`
    with checked(function_name) as (
      values
        ('public.append_remaster_pipeline_job_event(uuid, text, text, text, text, text, jsonb, uuid)'::regprocedure),
        ('public.claim_remaster_pipeline_job(text, uuid, integer)'::regprocedure),
        ('public.heartbeat_remaster_pipeline_job(uuid, uuid, integer)'::regprocedure),
        ('public.transition_remaster_pipeline_job(uuid, text, text, text, integer, text, timestamptz, text, text, uuid, boolean, text, text, jsonb, uuid)'::regprocedure),
        ('public.mark_remaster_youtube_upload_started(uuid, uuid, uuid)'::regprocedure),
        ('public.record_remaster_youtube_video(uuid, uuid, text, text, uuid)'::regprocedure),
        ('public.release_remaster_pipeline_job_lease(uuid, uuid, uuid)'::regprocedure),
        ('public.request_remaster_pipeline_job_cancel(uuid, text, uuid)'::regprocedure)
    ),
    grants as (
      select
        checked.function_name::text as function_name,
        acl.grantee,
        roles.rolname,
        acl.privilege_type
      from checked
      join pg_proc functions on functions.oid = checked.function_name::oid
      cross join lateral aclexplode(coalesce(functions.proacl, acldefault('f', functions.proowner))) as acl
      left join pg_roles roles on roles.oid = acl.grantee
    )
    select
      function_name,
      coalesce(bool_or(grantee = 0 and privilege_type = 'EXECUTE'), false) as public_execute,
      coalesce(bool_or(rolname = 'anon' and privilege_type = 'EXECUTE'), false) as anon_execute,
      coalesce(bool_or(rolname = 'authenticated' and privilege_type = 'EXECUTE'), false) as authenticated_execute,
      coalesce(bool_or(rolname = 'service_role' and privilege_type = 'EXECUTE'), false) as service_role_execute
    from grants
    group by function_name
    order by function_name
  `);

  assert(rows.length === 8, `Expected 8 Re-Master RPC privilege rows, got ${rows.length}.`);
  for (const row of rows) {
    assert(row.public_execute === false, `${row.function_name} grants EXECUTE to PUBLIC.`);
    assert(row.anon_execute === false, `${row.function_name} grants EXECUTE to anon.`);
    assert(row.authenticated_execute === false, `${row.function_name} grants EXECUTE to authenticated.`);
    assert(row.service_role_execute === true, `${row.function_name} does not grant EXECUTE to service_role.`);
  }
}

async function testRemasterJobCore() {
  await withClient(async (client) => {
    process.stdout.write("  Scenario: empty database\n");
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
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
      await assertRejectsQuery(
        client,
        `select * from public.heartbeat_remaster_pipeline_job('${claimed.id}', '00000000-0000-0000-0000-000000000000'::uuid)`,
        "Heartbeat succeeded with the wrong lease token.",
        "LEASE_TOKEN_INVALID",
      );
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
    await assertRejectsQuery(
      client,
      `select * from public.heartbeat_remaster_pipeline_job('${expiredJob.id}', '11111111-1111-1111-1111-111111111111'::uuid)`,
      "Old lease token could heartbeat after recovery.",
      "LEASE_TOKEN_INVALID",
    );

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

    process.stdout.write("  Scenario: manual-review and not-retryable jobs are not claimed\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    await insertRemasterJob(client, { manual_review_required: true });
    await insertRemasterJob(client, { retry_classification: "manual_review" });
    await insertRemasterJob(client, { retry_classification: "not_retryable" });
    const blockedClaim = await client.query("select * from public.claim_remaster_pipeline_job('blocked-worker')");
    assert(blockedClaim.rows.length === 0, "Manual-review or not-retryable job was claimed.");

    process.stdout.write("  Scenario: stale worker cannot mutate after lease expiry\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const staleJob = await insertRemasterJob(client, {
      status: "running",
      lease_owner: "stale-worker",
      lease_token: "44444444-4444-4444-4444-444444444444",
      lease_expires_at: "2026-01-01T00:00:00.000Z",
    });
    await assertRejectsQuery(
      client,
      `select * from public.mark_remaster_youtube_upload_started('${staleJob.id}', '44444444-4444-4444-4444-444444444444'::uuid)`,
      "Stale worker marked YouTube upload after lease expiry.",
      "LEASE_EXPIRED",
    );
    await assertRejectsQuery(
      client,
      `select * from public.transition_remaster_pipeline_job('${staleJob.id}', 'running', 'completed', null, null, null, null, null, null, '44444444-4444-4444-4444-444444444444'::uuid, true)`,
      "Stale worker transitioned job after lease expiry.",
      "LEASE_EXPIRED",
    );

    process.stdout.write("  Scenario: invalid transition is rejected atomically\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const invalidTransitionJob = await insertRemasterJob(client, { status: "queued" });
    await assertRejectsQuery(
      client,
      `select * from public.transition_remaster_pipeline_job('${invalidTransitionJob.id}', 'queued', 'completed')`,
      "Invalid queued -> completed transition succeeded.",
      "INVALID_JOB_TRANSITION",
    );

    process.stdout.write("  Scenario: generic transition cannot bypass cancellation policy\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const genericCancelBeforeUpload = await insertRemasterJob(client, {
      status: "running",
      lease_owner: "worker",
      lease_token: "12121212-1212-1212-1212-121212121212",
      lease_expires_at: "2999-01-01T00:00:00.000Z",
    });
    await assertRejectsQuery(
      client,
      `select * from public.transition_remaster_pipeline_job('${genericCancelBeforeUpload.id}', 'running', 'cancelled', null, null, null, null, null, null, '12121212-1212-1212-1212-121212121212'::uuid, true)`,
      "Generic running -> cancelled transition succeeded before upload.",
      "INVALID_JOB_TRANSITION",
    );

    const genericCancelAfterUpload = await insertRemasterJob(client, {
      status: "running",
      lease_owner: "worker",
      lease_token: "13131313-1313-1313-1313-131313131313",
      lease_expires_at: "2999-01-01T00:00:00.000Z",
      youtube_upload_started_at: "2026-06-07T10:00:00.000Z",
    });
    await assertRejectsQuery(
      client,
      `select * from public.transition_remaster_pipeline_job('${genericCancelAfterUpload.id}', 'running', 'cancelled', null, null, null, null, null, null, '13131313-1313-1313-1313-131313131313'::uuid, true)`,
      "Generic running -> cancelled transition succeeded after upload start.",
      "INVALID_JOB_TRANSITION",
    );

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

    process.stdout.write("  Scenario: cancel race before and after upload start\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const cancelBeforeUpload = await insertRemasterJob(client, {
      status: "running",
      lease_owner: "worker",
      lease_token: "55555555-5555-5555-5555-555555555555",
      lease_expires_at: "2999-01-01T00:00:00.000Z",
    });
    const cancelRequest = await client.query(
      "select * from public.request_remaster_pipeline_job_cancel($1, 'stop before upload', $2::uuid)",
      [cancelBeforeUpload.id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    );
    assert(cancelRequest.rows[0].status === "running", "Running job was directly cancelled while worker may run.");
    assert(cancelRequest.rows[0].cancel_requested_at, "Running job did not store cancel_requested_at.");
    await assertRejectsQuery(
      client,
      `select * from public.mark_remaster_youtube_upload_started('${cancelBeforeUpload.id}', '55555555-5555-5555-5555-555555555555'::uuid)`,
      "Upload started after cancellation was requested.",
      "CANCELLATION_REQUIRES_MANUAL_REVIEW",
    );

    const cancelAfterUpload = await insertRemasterJob(client, {
      status: "running",
      lease_owner: "worker",
      lease_token: "66666666-6666-6666-6666-666666666666",
      lease_expires_at: "2999-01-01T00:00:00.000Z",
    });
    await client.query(
      "select * from public.mark_remaster_youtube_upload_started($1, $2::uuid)",
      [cancelAfterUpload.id, "66666666-6666-6666-6666-666666666666"],
    );
    const afterUploadCancel = await client.query(
      "select * from public.request_remaster_pipeline_job_cancel($1, 'stop after upload', null)",
      [cancelAfterUpload.id],
    );
    assert(afterUploadCancel.rows[0].manual_review_required === true, "Cancel after upload did not require manual review.");
    assert(
      afterUploadCancel.rows[0].retry_classification === "manual_review",
      "Cancel after upload did not mark manual_review classification.",
    );

    process.stdout.write("  Scenario: YouTube checkpoints are write-once\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const laterStepJob = await insertRemasterJob(client, {
      status: "running",
      pipeline_step: "set_thumbnail",
      lease_owner: "worker",
      lease_token: "14141414-1414-1414-1414-141414141414",
      lease_expires_at: "2999-01-01T00:00:00.000Z",
    });
    await assertRejectsQuery(
      client,
      `select * from public.mark_remaster_youtube_upload_started('${laterStepJob.id}', '14141414-1414-1414-1414-141414141414'::uuid)`,
      "YouTube upload start moved a later pipeline step backward.",
      "INVALID_PIPELINE_STEP_TRANSITION",
    );

    const youtubeJob = await insertRemasterJob(client, {
      status: "running",
      lease_owner: "worker",
      lease_token: "77777777-7777-7777-7777-777777777777",
      lease_expires_at: "2999-01-01T00:00:00.000Z",
    });
    await client.query(
      "select * from public.mark_remaster_youtube_upload_started($1, $2::uuid, $3::uuid)",
      [youtubeJob.id, "77777777-7777-7777-7777-777777777777", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
    );
    await assertRejectsQuery(
      client,
      `select * from public.mark_remaster_youtube_upload_started('${youtubeJob.id}', '77777777-7777-7777-7777-777777777777'::uuid)`,
      "Double upload-start was accepted.",
      "YOUTUBE_UPLOAD_AMBIGUOUS",
    );
    const recordedVideo = await client.query(
      "select * from public.record_remaster_youtube_video($1, $2::uuid, 'yt-abc', 'https://youtube.com/watch?v=yt-abc', $3::uuid)",
      [youtubeJob.id, "77777777-7777-7777-7777-777777777777", "cccccccc-cccc-cccc-cccc-cccccccccccc"],
    );
    assert(recordedVideo.rows[0].youtube_video_id === "yt-abc", "YouTube video ID was not stored.");
    const idempotentVideo = await client.query(
      "select * from public.record_remaster_youtube_video($1, $2::uuid, 'yt-abc', 'https://youtube.com/watch?v=yt-abc', null)",
      [youtubeJob.id, "77777777-7777-7777-7777-777777777777"],
    );
    assert(idempotentVideo.rows[0].youtube_video_id === "yt-abc", "Same YouTube ID was not idempotent.");
    await assertRejectsQuery(
      client,
      `select * from public.record_remaster_youtube_video('${youtubeJob.id}', '77777777-7777-7777-7777-777777777777'::uuid, 'yt-other', 'https://youtube.com/watch?v=yt-other')`,
      "Different YouTube ID overwrote stored ID.",
      "YOUTUBE_VIDEO_CONFLICT",
    );

    process.stdout.write("  Scenario: release lease requires correct lease\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const releaseJob = await insertRemasterJob(client, {
      status: "running",
      lease_owner: "worker",
      lease_token: "88888888-8888-8888-8888-888888888888",
      lease_expires_at: "2999-01-01T00:00:00.000Z",
    });
    await assertRejectsQuery(
      client,
      `select * from public.release_remaster_pipeline_job_lease('${releaseJob.id}', '00000000-0000-0000-0000-000000000000'::uuid)`,
      "Lease release succeeded with wrong token.",
      "LEASE_TOKEN_INVALID",
    );
    const released = await client.query(
      "select * from public.release_remaster_pipeline_job_lease($1, $2::uuid, $3::uuid)",
      [releaseJob.id, "88888888-8888-8888-8888-888888888888", "dddddddd-dddd-dddd-dddd-dddddddddddd"],
    );
    assert(released.rows[0].status === "waiting_retry", "Lease release did not move job out of running.");
    assert(released.rows[0].lease_token === null, "Lease token was not cleared on release.");
    assert(released.rows[0].lease_expires_at === null, "Lease expiry was not cleared on release.");
    const orphanedRunning = await client.query(
      "select count(*)::int as count from public.remaster_pipeline_jobs where id = $1 and status = 'running' and lease_token is null and lease_expires_at is null",
      [releaseJob.id],
    );
    assert(orphanedRunning.rows[0].count === 0, "Lease release created an orphaned running job.");
    const releaseEvent = await client.query(
      "select event_type, status, correlation_id from public.remaster_pipeline_job_events where job_id = $1 order by event_sequence desc limit 1",
      [releaseJob.id],
    );
    assert(releaseEvent.rows[0].event_type === "lease_released", "Lease release did not write a release event.");
    assert(releaseEvent.rows[0].status === "waiting_retry", "Lease release event did not store the next status.");
    assert(
      releaseEvent.rows[0].correlation_id === "dddddddd-dddd-dddd-dddd-dddddddddddd",
      "Lease release event did not store correlation ID.",
    );

    process.stdout.write("  Scenario: transition event stores correlation ID and consistent state\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const transitionJob = await insertRemasterJob(client, {
      status: "running",
      pipeline_step: "persist_results",
      lease_owner: "worker",
      lease_token: "99999999-9999-9999-9999-999999999999",
      lease_expires_at: "2999-01-01T00:00:00.000Z",
    });
    const completed = await client.query(
      "select * from public.transition_remaster_pipeline_job($1, 'running', 'completed', 'completed', null, null, null, null, null, $2::uuid, true, 'job_completed', 'Job completed', '{}'::jsonb, $3::uuid)",
      [transitionJob.id, "99999999-9999-9999-9999-999999999999", "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"],
    );
    assert(completed.rows[0].status === "completed", "Transition did not complete the job.");
    const transitionEvents = await client.query(
      "select status, pipeline_step, correlation_id from public.remaster_pipeline_job_events where job_id = $1 order by event_sequence desc limit 1",
      [transitionJob.id],
    );
    assert(transitionEvents.rows[0].status === "completed", "Transition event status is inconsistent.");
    assert(transitionEvents.rows[0].pipeline_step === "completed", "Transition event step is inconsistent.");
    assert(
      transitionEvents.rows[0].correlation_id === "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      "Transition event correlation_id was not stored.",
    );

    process.stdout.write("  Scenario: event order\n");
    await client.query("truncate public.remaster_pipeline_job_events, public.remaster_pipeline_jobs cascade");
    const eventJob = await insertRemasterJob(client);
    await client.query(
      "select public.append_remaster_pipeline_job_event($1, 'step_started', 'info', 'running', 'download_audio', 'Download started', '{}'::jsonb, $2::uuid)",
      [eventJob.id, "ffffffff-ffff-ffff-ffff-ffffffffffff"],
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
    assert(
      BigInt(events.rows[0].event_sequence) < BigInt(events.rows[1].event_sequence),
      "Event sequence did not increase.",
    );
    const correlation = await client.query(
      "select correlation_id from public.remaster_pipeline_job_events where job_id = $1 order by event_sequence limit 1",
      [eventJob.id],
    );
    assert(correlation.rows[0].correlation_id === "ffffffff-ffff-ffff-ffff-ffffffffffff", "Event correlation ID was not stored.");
  });
}

async function tableExists(client, tableName) {
  const { rows } = await client.query("select to_regclass($1) as oid", [`public.${tableName}`]);
  return rows[0].oid === tableName;
}

async function assertTableHasColumns(client, tableName, columnNames) {
  const columns = await getColumns(client, tableName);
  for (const columnName of columnNames) {
    assert(columns.has(columnName), `Missing public.${tableName}.${columnName}.`);
  }
  return columns;
}

async function assertLeadIntelligenceRlsClosed(client) {
  const tables = [
    "lead_intake_messages",
    "lead_analysis_runs",
    "buyer_profiles",
    "buyer_profile_criteria",
    "lead_contact_candidates",
  ];

  for (const tableName of tables) {
    const { rows } = await client.query(
      `
        select relrowsecurity
        from pg_class
        where oid = format('public.%I', $1::text)::regclass
      `,
      [tableName],
    );
    assert(rows[0].relrowsecurity === true, `RLS is not enabled on public.${tableName}.`);

    const { rows: policyRows } = await client.query(
      `
        select count(*)::int as count
        from pg_policies
        where schemaname = 'public'
          and tablename = $1
      `,
      [tableName],
    );
    assert(policyRows[0].count === 0, `public.${tableName} should not create browser policies.`);

    const { rows: openPolicies } = await client.query(
      `
        select count(*)::int as count
        from pg_policies
        where schemaname = 'public'
          and tablename = $1
          and (
            lower(coalesce(qual, '')) in ('true', '(true)')
            or lower(coalesce(with_check, '')) in ('true', '(true)')
          )
      `,
      [tableName],
    );
    assert(openPolicies[0].count === 0, `public.${tableName} has an open policy.`);

    const { rows: grants } = await client.query(
      `
        select
          has_table_privilege('anon', format('public.%I', $1::text), 'select') as anon_select,
          has_table_privilege('authenticated', format('public.%I', $1::text), 'select') as authenticated_select,
          has_table_privilege('service_role', format('public.%I', $1::text), 'select') as service_select,
          has_table_privilege('service_role', format('public.%I', $1::text), 'insert') as service_insert
      `,
      [tableName],
    );
    const { rows: publicGrants } = await client.query(
      `
        select count(*)::int as count
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
        where n.nspname = 'public'
          and c.relname = $1
          and acl.grantee = 0
          and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      `,
      [tableName],
    );
    assert(publicGrants[0].count === 0, `PUBLIC has table access on public.${tableName}.`);
    assert(grants[0].anon_select === false, `anon unexpectedly has SELECT on public.${tableName}.`);
    assert(
      grants[0].authenticated_select === false,
      `authenticated unexpectedly has SELECT on public.${tableName}.`,
    );
    assert(grants[0].service_select === true, `service_role lacks SELECT on public.${tableName}.`);
    assert(grants[0].service_insert === true, `service_role lacks INSERT on public.${tableName}.`);
  }
}

async function createLeadIntelligenceRuntimeTestObjects(client) {
  await client.query(`
    create table public.contacts (
      id uuid primary key default gen_random_uuid(),
      brand text not null,
      name text,
      phone text,
      email text,
      pipeline_status text,
      pipeline_value numeric,
      property_interest text,
      source text,
      sentiment text,
      notes text,
      interactions jsonb not null default '[]'::jsonb,
      last_contact timestamptz,
      next_followup timestamptz,
      secret_note text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table public.contacts enable row level security;

    create table public.leads (
      id uuid primary key default gen_random_uuid(),
      brand text not null,
      sensitive_note text
    );

    create table public.email_messages (
      id uuid primary key default gen_random_uuid(),
      provider_payload jsonb
    );

    create table public.oauth_tokens (
      id uuid primary key default gen_random_uuid(),
      refresh_token text
    );

    create sequence public.sensitive_sequence;

    create schema if not exists storage;
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text,
      name text,
      owner text
    );
  `);
}

async function dropLeadIntelligenceRuntimeTestRole(client) {
  await client.query(`
    do $$
    begin
      if exists (select 1 from pg_roles where rolname = 'lead_intelligence_runtime_dangerous_parent') then
        drop owned by lead_intelligence_runtime_dangerous_parent;
      end if;

      if exists (select 1 from pg_roles where rolname = 'lead_intelligence_runtime_safe_parent') then
        drop owned by lead_intelligence_runtime_safe_parent;
      end if;

      if exists (select 1 from pg_roles where rolname = 'lead_intelligence_migration_owner') then
        drop owned by lead_intelligence_migration_owner;
      end if;

      if exists (select 1 from pg_roles where rolname = 'lead_intelligence_migration_runner') then
        drop owned by lead_intelligence_migration_runner;
      end if;

      if exists (select 1 from pg_roles where rolname = 'lead_intelligence_runtime_parent') and
         exists (select 1 from pg_roles where rolname = 'realtyflow_lead_intelligence_runtime') then
        revoke lead_intelligence_runtime_parent from realtyflow_lead_intelligence_runtime;
      end if;

      if exists (select 1 from pg_roles where rolname = 'lead_intelligence_runtime_dangerous_parent') and
         exists (select 1 from pg_roles where rolname = 'realtyflow_lead_intelligence_runtime') then
        revoke lead_intelligence_runtime_dangerous_parent from realtyflow_lead_intelligence_runtime;
      end if;

      if exists (select 1 from pg_roles where rolname = 'lead_intelligence_runtime_safe_parent') and
         exists (select 1 from pg_roles where rolname = 'realtyflow_lead_intelligence_runtime') then
        revoke lead_intelligence_runtime_safe_parent from realtyflow_lead_intelligence_runtime;
      end if;

      if exists (select 1 from pg_roles where rolname = 'lead_intelligence_migration_owner') and
         exists (select 1 from pg_roles where rolname = 'realtyflow_lead_intelligence_runtime') then
        revoke realtyflow_lead_intelligence_runtime from lead_intelligence_migration_owner;
      end if;

      if exists (select 1 from pg_roles where rolname = 'realtyflow_lead_intelligence_runtime') then
        drop owned by realtyflow_lead_intelligence_runtime;
      end if;
    end $$;

    drop table if exists public.runtime_owned_table cascade;
    drop role if exists realtyflow_lead_intelligence_runtime;
    drop role if exists lead_intelligence_runtime_parent;
    drop role if exists lead_intelligence_runtime_dangerous_parent;
    drop role if exists lead_intelligence_runtime_safe_parent;
    drop role if exists lead_intelligence_migration_owner;
    drop role if exists lead_intelligence_migration_runner;
  `);
}

async function queryAsRuntime(client, brand, sql, values = []) {
  await client.query("reset role");
  try {
    await client.query("set role realtyflow_lead_intelligence_runtime");
    await client.query("begin");
    if (brand === null) {
      await client.query("select set_config('app.lead_intelligence_brand', '', true)");
    } else {
      await client.query("select set_config('app.lead_intelligence_brand', $1, true)", [brand]);
    }
    const result = await client.query(sql, values);
    await client.query("commit");
    return result;
  } finally {
    try {
      await client.query("rollback");
    } catch {
      // The transaction may already have committed successfully.
    }
    await client.query("reset role");
  }
}

async function assertRejectsRuntimeQuery(client, brand, sql, message, expectedMessage) {
  let rejected = false;
  try {
    await queryAsRuntime(client, brand, sql);
  } catch (error) {
    rejected = true;
    if (expectedMessage) {
      assert(
        error instanceof Error && error.message.includes(expectedMessage),
        `${message} Expected error message to include ${expectedMessage}.`,
      );
    }
  }
  assert(rejected, message);
}

async function assertLeadIntelligenceRuntimePolicySet(client) {
  const expectedPolicies = [
    ["lead_intake_messages", "lead_intake_messages_runtime_select", "SELECT"],
    ["lead_intake_messages", "lead_intake_messages_runtime_insert", "INSERT"],
    ["lead_analysis_runs", "lead_analysis_runs_runtime_select", "SELECT"],
    ["lead_analysis_runs", "lead_analysis_runs_runtime_insert", "INSERT"],
    ["buyer_profiles", "buyer_profiles_runtime_select", "SELECT"],
    ["buyer_profiles", "buyer_profiles_runtime_insert", "INSERT"],
    ["buyer_profile_criteria", "buyer_profile_criteria_runtime_select", "SELECT"],
    ["buyer_profile_criteria", "buyer_profile_criteria_runtime_insert", "INSERT"],
    ["lead_contact_candidates", "lead_contact_candidates_runtime_select", "SELECT"],
    ["lead_contact_candidates", "lead_contact_candidates_runtime_insert", "INSERT"],
    ["lead_contact_candidates", "lead_contact_candidates_runtime_update", "UPDATE"],
  ];

  for (const [tableName, policyName, command] of expectedPolicies) {
    const { rows } = await client.query(
      `
        select
          policyname,
          cmd,
          roles::text as roles,
          qual,
          with_check
        from pg_policies
        where schemaname = 'public'
          and tablename = $1
          and policyname = $2
      `,
      [tableName, policyName],
    );
    assert(rows.length === 1, `Missing policy public.${tableName}.${policyName}.`);
    assert(rows[0].cmd === command, `Unexpected command for policy ${policyName}.`);
    assert(
      rows[0].roles.includes("realtyflow_lead_intelligence_runtime"),
      `Policy ${policyName} is not scoped to runtime role.`,
    );
    assert(
      !["true", "(true)"].includes(String(rows[0].qual || "").toLowerCase()),
      `Policy ${policyName} has open USING.`,
    );
    assert(
      !["true", "(true)"].includes(String(rows[0].with_check || "").toLowerCase()),
      `Policy ${policyName} has open WITH CHECK.`,
    );
    assert(
      String(rows[0].qual || rows[0].with_check || "").includes("lead_intelligence_brand") ||
        ["lead_analysis_runs", "buyer_profile_criteria"].includes(tableName),
      `Policy ${policyName} does not reference brand context or a brand-linked parent.`,
    );
  }
}

async function assertNoPublicRuntimeTableGrants(client) {
  for (const tableName of [
    "lead_intake_messages",
    "lead_analysis_runs",
    "buyer_profiles",
    "buyer_profile_criteria",
    "lead_contact_candidates",
    "lead_intelligence_contact_lookup",
  ]) {
    const { rows } = await client.query(
      `
        select
          has_table_privilege('anon', format('public.%I', $1::text), 'select') as anon_select,
          has_table_privilege('anon', format('public.%I', $1::text), 'insert') as anon_insert,
          has_table_privilege('authenticated', format('public.%I', $1::text), 'select') as authenticated_select,
          has_table_privilege('authenticated', format('public.%I', $1::text), 'insert') as authenticated_insert
      `,
      [tableName],
    );
    assert(rows[0].anon_select === false, `anon can SELECT public.${tableName}.`);
    assert(rows[0].anon_insert === false, `anon can INSERT public.${tableName}.`);
    assert(rows[0].authenticated_select === false, `authenticated can SELECT public.${tableName}.`);
    assert(rows[0].authenticated_insert === false, `authenticated can INSERT public.${tableName}.`);

    const { rows: publicRows } = await client.query(
      `
        select count(*)::int as count
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
        where n.nspname = 'public'
          and c.relname = $1
          and acl.grantee = 0
          and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      `,
      [tableName],
    );
    assert(publicRows[0].count === 0, `PUBLIC has table privileges on public.${tableName}.`);
  }
}

async function testLeadIntelligencePersistenceFoundation() {
  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);

    process.stdout.write("  Scenario: applies to empty DB and is idempotent\n");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    const expectedTables = [
      "lead_intake_messages",
      "lead_analysis_runs",
      "buyer_profiles",
      "buyer_profile_criteria",
      "lead_contact_candidates",
    ];
    for (const tableName of expectedTables) {
      assert(await tableExists(client, tableName), `public.${tableName} was not created.`);
    }

    const intakeColumns = await assertTableHasColumns(client, "lead_intake_messages", [
      "id",
      "brand",
      "source",
      "raw_text_restricted",
      "raw_text_retention_until",
      "redacted_at",
      "language",
      "status",
      "created_by",
      "created_at",
      "updated_at",
      "correlation_id",
      "idempotency_key",
    ]);
    const analysisColumns = await assertTableHasColumns(client, "lead_analysis_runs", [
      "id",
      "intake_id",
      "idempotency_key",
      "prompt_version",
      "model",
      "result_json",
      "validation_status",
      "repaired",
      "duration_ms",
      "approved",
      "approved_by",
      "approved_at",
      "created_at",
    ]);
    const profileColumns = await assertTableHasColumns(client, "buyer_profiles", [
      "id",
      "brand",
      "contact_id",
      "intake_id",
      "version",
      "status",
      "purchase_readiness",
      "budget_amount",
      "budget_currency",
      "budget_includes_costs",
      "budget_approximate",
      "location_flexible",
      "summary",
      "created_by",
      "approved_by",
      "approved_at",
      "created_at",
      "updated_at",
    ]);
    const criterionColumns = await assertTableHasColumns(client, "buyer_profile_criteria", [
      "id",
      "buyer_profile_id",
      "criterion_type",
      "key",
      "other_key",
      "operator",
      "value",
      "weight",
      "severity",
      "applies_to_property_types",
      "source",
      "source_text",
      "confidence",
      "customer_confirmed",
      "approval_status",
      "approved_by",
      "approved_at",
      "active",
      "created_at",
      "updated_at",
    ]);
    const candidateColumns = await assertTableHasColumns(client, "lead_contact_candidates", [
      "id",
      "brand",
      "intake_id",
      "contact_id",
      "match_type",
      "match_value_hash",
      "score",
      "reasons",
      "status",
      "created_at",
    ]);

    for (const [columns, tableName, criticalColumns] of [
      [
        intakeColumns,
        "lead_intake_messages",
        ["id", "brand", "source", "status", "created_by", "created_at", "updated_at", "correlation_id", "idempotency_key"],
      ],
      [
        analysisColumns,
        "lead_analysis_runs",
        ["id", "intake_id", "idempotency_key", "prompt_version", "model", "result_json", "validation_status", "repaired", "approved", "created_at"],
      ],
      [
        profileColumns,
        "buyer_profiles",
        ["id", "brand", "intake_id", "version", "status", "purchase_readiness", "budget_approximate", "location_flexible", "created_by", "created_at", "updated_at"],
      ],
      [
        criterionColumns,
        "buyer_profile_criteria",
        ["id", "buyer_profile_id", "criterion_type", "key", "operator", "value", "applies_to_property_types", "source", "customer_confirmed", "approval_status", "active", "created_at", "updated_at"],
      ],
      [
        candidateColumns,
        "lead_contact_candidates",
        ["id", "brand", "intake_id", "contact_id", "match_type", "match_value_hash", "score", "reasons", "status", "created_at"],
      ],
    ]) {
      for (const columnName of criticalColumns) {
        assert(
          columns.get(columnName).is_nullable === "NO",
          `Expected public.${tableName}.${columnName} to be NOT NULL.`,
        );
      }
    }

    process.stdout.write("  Scenario: constraints, indexes, and RLS are present\n");
    const intakeConstraints = await getTableConstraints(client, "lead_intake_messages");
    assert(intakeConstraints.has("lead_intake_messages_status_check"), "Intake status check is missing.");
    assert(intakeConstraints.has("lead_intake_messages_source_check"), "Intake source check is missing.");
    assert(intakeConstraints.has("lead_intake_messages_brand_check"), "Intake brand check is missing.");
    assert(
      intakeConstraints.has("lead_intake_messages_brand_idempotency_key_key"),
      "Intake idempotency uniqueness is missing.",
    );

    const analysisConstraints = await getTableConstraints(client, "lead_analysis_runs");
    assert(analysisConstraints.has("lead_analysis_runs_intake_id_fkey"), "Analysis FK is missing.");
    assert(
      analysisConstraints.has("lead_analysis_runs_validation_status_check"),
      "Analysis validation status check is missing.",
    );
    assert(
      analysisConstraints.has("lead_analysis_runs_intake_id_idempotency_key_key"),
      "Analysis idempotency uniqueness is missing.",
    );

    const profileConstraints = await getTableConstraints(client, "buyer_profiles");
    assert(profileConstraints.has("buyer_profiles_intake_brand_fkey"), "Buyer profile brand/intake FK is missing.");
    assert(profileConstraints.has("buyer_profiles_status_check"), "Buyer profile status check is missing.");
    assert(profileConstraints.has("buyer_profiles_approval_check"), "Buyer profile approval check is missing.");
    assert(profileConstraints.has("buyer_profiles_intake_version_key"), "Buyer profile version uniqueness is missing.");

    const criterionConstraints = await getTableConstraints(client, "buyer_profile_criteria");
    assert(
      criterionConstraints.has("buyer_profile_criteria_buyer_profile_id_fkey"),
      "Criterion FK is missing.",
    );
    assert(criterionConstraints.has("buyer_profile_criteria_key_check"), "Criterion key check is missing.");
    assert(
      criterionConstraints.has("buyer_profile_criteria_approval_check"),
      "Criterion approval check is missing.",
    );

    const candidateConstraints = await getTableConstraints(client, "lead_contact_candidates");
    assert(candidateConstraints.has("lead_contact_candidates_intake_brand_fkey"), "Candidate brand/intake FK is missing.");
    assert(candidateConstraints.has("lead_contact_candidates_score_check"), "Candidate score check is missing.");
    assert(
      candidateConstraints.has("lead_contact_candidates_intake_match_hash_key"),
      "Candidate idempotency uniqueness is missing.",
    );

    for (const [tableName, constraints] of [
      ["lead_intake_messages", intakeConstraints],
      ["lead_analysis_runs", analysisConstraints],
      ["buyer_profiles", profileConstraints],
      ["buyer_profile_criteria", criterionConstraints],
      ["lead_contact_candidates", candidateConstraints],
    ]) {
      for (const [constraintName, constraint] of constraints) {
        if (["c", "f"].includes(constraint.contype)) {
          assert(
            constraint.convalidated === true,
            `Expected ${tableName}.${constraintName} to have convalidated=true.`,
          );
        }
      }
    }

    for (const indexName of [
      "idx_lead_intake_messages_brand_status_created",
      "idx_lead_analysis_runs_intake_created",
      "idx_buyer_profiles_brand_status_created",
      "idx_buyer_profile_criteria_profile_type_active",
      "idx_lead_contact_candidates_intake_status_score",
      "idx_lead_contact_candidates_lookup",
    ]) {
      await getIndexDetails(client, indexName);
    }

    await assertLeadIntelligenceRlsClosed(client);

    const rawOutputColumn = await client.query(
      `
        select count(*)::int as count
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'lead_analysis_runs'
          and column_name in ('provider_raw_output', 'raw_provider_output', 'raw_output')
      `,
    );
    assert(rawOutputColumn.rows[0].count === 0, "Provider raw output must not be persisted.");

    process.stdout.write("  Scenario: valid rows insert and invalid contracts are rejected\n");
    const intake = await client.query(
      `
        insert into public.lead_intake_messages (
          brand,
          source,
          raw_text_restricted,
          language,
          status,
          created_by,
          correlation_id,
          idempotency_key
        )
        values ('soleada', 'phone_call', 'restricted raw note', 'no', 'draft', 'freddy.bremseth@gmail.com', 'rf_test_0123456789abcdef01234567', 'intake-key-001')
        returning id
      `,
    );
    const intakeId = intake.rows[0].id;

    await client.query(
      `
        insert into public.lead_analysis_runs (
          intake_id,
          idempotency_key,
          prompt_version,
          model,
          result_json,
          validation_status,
          repaired,
          duration_ms
        )
        values ($1, 'analysis-key-001', 'lead-intelligence-extraction-v1', 'mock', '{"ok": true}'::jsonb, 'valid', false, 120)
      `,
      [intakeId],
    );

    const profile = await client.query(
      `
        insert into public.buyer_profiles (
          brand,
          intake_id,
          version,
          status,
          purchase_readiness,
          budget_amount,
          budget_currency,
          budget_includes_costs,
          budget_approximate,
          location_flexible,
          summary,
          created_by,
          approved_by,
          approved_at
        )
        values (
          'soleada',
          $1,
          1,
          'approved',
          'ready_to_buy',
          440000,
          'EUR',
          true,
          true,
          true,
          'Approved buyer profile',
          'freddy.bremseth@gmail.com',
          'freddy.bremseth@gmail.com',
          now()
        )
        returning id
      `,
      [intakeId],
    );
    const profileId = profile.rows[0].id;

    await client.query(
      `
        insert into public.buyer_profile_criteria (
          buyer_profile_id,
          criterion_type,
          key,
          operator,
          value,
          applies_to_property_types,
          source,
          source_text,
          confidence,
          customer_confirmed,
          approval_status,
          approved_by,
          approved_at,
          active
        )
        values (
          $1,
          'hard_requirement',
          'bedrooms',
          'gte',
          '2'::jsonb,
          array['apartment']::text[],
          'ai_suggestion',
          'Minst 2 soverom.',
          0.9,
          false,
          'approved',
          'freddy.bremseth@gmail.com',
          now(),
          true
        )
      `,
      [profileId],
    );

    await client.query(
      `
        insert into public.lead_contact_candidates (
          brand,
          intake_id,
          contact_id,
          match_type,
          match_value_hash,
          score,
          reasons
        )
        values ('soleada', $1, gen_random_uuid(), 'exact_phone', 'hmac-sha256:v1:' || repeat('a', 64), 0.98, '["masked exact phone"]'::jsonb)
      `,
      [intakeId],
    );

    process.stdout.write("  Scenario: idempotent retry does not duplicate intake or candidates\n");
    const duplicateIntake = await client.query(
      `
        insert into public.lead_intake_messages (
          brand,
          source,
          raw_text_restricted,
          language,
          status,
          created_by,
          correlation_id,
          idempotency_key
        )
        values ('soleada', 'phone_call', 'retry raw note', 'no', 'draft', 'freddy.bremseth@gmail.com', 'rf_test_retry_0123456789abcdef', 'intake-key-001')
        on conflict (brand, idempotency_key) do nothing
        returning id
      `,
    );
    assert(duplicateIntake.rows.length === 0, "Duplicate intake idempotency key inserted a second row.");

    const beforeCandidates = await client.query(
      "select count(*)::int as count from public.lead_contact_candidates where intake_id = $1",
      [intakeId],
    );
    await client.query(
      `
        insert into public.lead_contact_candidates (
          brand,
          intake_id,
          contact_id,
          match_type,
          match_value_hash,
          score,
          reasons
        )
        values ('soleada', $1, gen_random_uuid(), 'exact_phone', 'hmac-sha256:v1:' || repeat('a', 64), 0.98, '["same candidate"]'::jsonb)
        on conflict (intake_id, match_type, match_value_hash)
        do update set score = excluded.score, reasons = excluded.reasons
      `,
      [intakeId],
    );
    const afterCandidates = await client.query(
      "select count(*)::int as count from public.lead_contact_candidates where intake_id = $1",
      [intakeId],
    );
    assert(
      afterCandidates.rows[0].count === beforeCandidates.rows[0].count,
      "Idempotent candidate retry inserted a duplicate row.",
    );

    await assertRejectsQuery(
      client,
      `
        insert into public.lead_intake_messages (brand, source, status, created_by, correlation_id, idempotency_key)
        values ('soleada', 'phone_call', 'bad_status', 'freddy.bremseth@gmail.com', 'rf_bad_0123456789abcdef012345', 'intake-key-bad')
      `,
      "Invalid intake status was accepted.",
      "lead_intake_messages_status_check",
    );

    await assertRejectsQuery(
      client,
      `
        insert into public.buyer_profiles (
          brand,
          intake_id,
          version,
          status,
          purchase_readiness,
          created_by
        )
        values ('soleada', '${intakeId}', 2, 'approved', 'ready_to_buy', 'freddy.bremseth@gmail.com')
      `,
      "Approved buyer profile without approver was accepted.",
      "buyer_profiles_approval_check",
    );

    await assertRejectsQuery(
      client,
      `
        insert into public.buyer_profiles (
          brand,
          intake_id,
          version,
          status,
          purchase_readiness,
          created_by,
          approved_by
        )
        values ('soleada', '${intakeId}', 2, 'draft', 'ready_to_buy', 'freddy.bremseth@gmail.com', 'freddy.bremseth@gmail.com')
      `,
      "Draft buyer profile with stale approved_by was accepted.",
      "buyer_profiles_approval_check",
    );

    await assertRejectsQuery(
      client,
      `
        insert into public.buyer_profile_criteria (
          buyer_profile_id,
          criterion_type,
          key,
          operator,
          value,
          source,
          approval_status,
          active
        )
        values (
          '${profileId}',
          'hard_requirement',
          'bedrooms',
          'gte',
          '2'::jsonb,
          'ai_suggestion',
          'rejected',
          true
        )
      `,
      "Rejected active criterion was accepted.",
      "buyer_profile_criteria_approval_check",
    );

    await assertRejectsQuery(
      client,
      `
        insert into public.buyer_profile_criteria (
          buyer_profile_id,
          criterion_type,
          key,
          other_key,
          operator,
          value,
          source,
          approval_status,
          active
        )
        values (
          '${profileId}',
          'hard_requirement',
          'unknown_new_key',
          null,
          'eq',
          'true'::jsonb,
          'ai_suggestion',
          'pending',
          true
        )
      `,
      "Unknown canonical criterion key was accepted.",
      "buyer_profile_criteria_key_check",
    );

    await assertRejectsQuery(
      client,
      `
        insert into public.lead_contact_candidates (
          brand,
          intake_id,
          contact_id,
          match_type,
          match_value_hash,
          score,
          reasons
        )
        values ('zeneco', '${intakeId}', gen_random_uuid(), 'exact_phone', 'hmac-sha256:v1:' || repeat('c', 64), 0.9, '[]'::jsonb)
      `,
      "Cross-brand contact candidate was accepted.",
      "lead_contact_candidates_intake_brand_fkey",
    );

    await assertRejectsQuery(
      client,
      `
        insert into public.lead_contact_candidates (
          brand,
          intake_id,
          contact_id,
          match_type,
          match_value_hash,
          score,
          reasons
        )
        values ('soleada', '${intakeId}', gen_random_uuid(), 'exact_phone', 'hmac-sha256:v1:' || repeat('b', 64), 1.5, '[]'::jsonb)
      `,
      "Candidate score above 1 was accepted.",
      "lead_contact_candidates_score_check",
    );

    process.stdout.write("  Scenario: updated_at trigger is scoped to Lead Intelligence tables\n");
    const triggerRows = await client.query(
      `
        select tgname, tgrelid::regclass::text as table_name
        from pg_trigger
        where tgname in (
          'trg_lead_intake_messages_updated_at',
          'trg_buyer_profiles_updated_at',
          'trg_buyer_profile_criteria_updated_at'
        )
        order by tgname
      `,
    );
    assert(triggerRows.rows.length === 3, "Expected three Lead Intelligence updated_at triggers.");
    assert(
      triggerRows.rows.every((row) =>
        [
          "lead_intake_messages",
          "public.lead_intake_messages",
          "buyer_profiles",
          "public.buyer_profiles",
          "buyer_profile_criteria",
          "public.buyer_profile_criteria",
        ].includes(row.table_name),
      ),
      "Lead Intelligence trigger attached to unexpected table.",
    );

    const publicFunctionPrivilegeRows = await client.query(`
      select count(*)::int as count
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where n.nspname = 'public'
        and p.proname = 'set_lead_intelligence_updated_at'
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    `);
    const functionPrivilegeRows = await client.query(`
      select
        has_function_privilege('anon', 'public.set_lead_intelligence_updated_at()', 'execute') as anon_execute,
        has_function_privilege('authenticated', 'public.set_lead_intelligence_updated_at()', 'execute') as authenticated_execute,
        has_function_privilege('service_role', 'public.set_lead_intelligence_updated_at()', 'execute') as service_execute
    `);
    assert(publicFunctionPrivilegeRows.rows[0].count === 0, "PUBLIC can execute trigger function.");
    assert(functionPrivilegeRows.rows[0].anon_execute === false, "anon can execute trigger function.");
    assert(
      functionPrivilegeRows.rows[0].authenticated_execute === false,
      "authenticated can execute trigger function.",
    );
    assert(functionPrivilegeRows.rows[0].service_execute === true, "service_role cannot execute trigger function.");
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);

    process.stdout.write("  Scenario: incompatible pre-existing schema fails closed\n");
    await client.query("create table public.lead_intake_messages (id text)");
    await assertRejectsQuery(
      client,
      `select 1; ${await fs.readFile(migrationFiles.leadIntelligencePersistence, "utf8")}`,
      "Migration accepted an incompatible partial legacy table.",
      "LEAD_INTELLIGENCE_SCHEMA_INCOMPATIBLE",
    );
  });
}

async function testLeadIntelligenceRuntimeRls() {
  const runtimeMigrationSql = await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8");
  assert(
    !/alter\s+role\s+realtyflow_lead_intelligence_runtime\s+[\s\S]{0,300}\bnosuperuser\b/i.test(
      runtimeMigrationSql,
    ),
    "Runtime migration must not use managed-Supabase-incompatible ALTER ROLE NOSUPERUSER.",
  );
  assert(
    !/alter\s+role\s+realtyflow_lead_intelligence_runtime\s+[\s\S]{0,300}\bnobypassrls\b/i.test(
      runtimeMigrationSql,
    ),
    "Runtime migration must not use managed-Supabase-incompatible ALTER ROLE NOBYPASSRLS.",
  );

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await client.query("revoke create on schema public from public");

    const publicCreateBefore = await client.query(`
      select exists (
        select 1
        from pg_namespace n
        cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) acl
        where n.nspname = 'public'
          and acl.grantee = 0
          and acl.privilege_type = 'CREATE'
      ) as public_create
    `);

    process.stdout.write("  Scenario: applies after PR 3A foundation and is idempotent\n");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);

    const publicCreateAfter = await client.query(`
      select exists (
        select 1
        from pg_namespace n
        cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) acl
        where n.nspname = 'public'
          and acl.grantee = 0
          and acl.privilege_type = 'CREATE'
      ) as public_create
    `);
    assert(
      publicCreateAfter.rows[0].public_create === publicCreateBefore.rows[0].public_create,
      "Migration changed global PUBLIC CREATE on schema public.",
    );

    process.stdout.write("  Scenario: runtime role is normal and not privileged\n");
    const runtimeRole = await client.query(`
      select
        rolcanlogin,
        rolsuper,
        rolcreatedb,
        rolcreaterole,
        rolinherit,
        rolbypassrls,
        rolconnlimit
      from pg_roles
      where rolname = 'realtyflow_lead_intelligence_runtime'
    `);
    assert(runtimeRole.rows.length === 1, "Runtime role was not created.");
    assert(runtimeRole.rows[0].rolcanlogin === true, "Runtime role should be a login role.");
    assert(runtimeRole.rows[0].rolsuper === false, "Runtime role is superuser.");
    assert(runtimeRole.rows[0].rolcreatedb === false, "Runtime role can create databases.");
    assert(runtimeRole.rows[0].rolcreaterole === false, "Runtime role can create roles.");
    assert(runtimeRole.rows[0].rolinherit === false, "Runtime role unexpectedly inherits memberships.");
    assert(runtimeRole.rows[0].rolbypassrls === false, "Runtime role has BYPASSRLS.");
    assert(Number(runtimeRole.rows[0].rolconnlimit) === 5, "Runtime role connection limit is not 5.");

    const membership = await client.query(`
      select count(*)::int as count
      from pg_auth_members
      where member = 'realtyflow_lead_intelligence_runtime'::regrole
         or roleid = 'realtyflow_lead_intelligence_runtime'::regrole
    `);
    assert(membership.rows[0].count === 0, "Runtime role has memberships.");

    process.stdout.write("  Scenario: grants are exactly runtime scoped\n");
    const grants = await client.query(`
      select
        has_schema_privilege('realtyflow_lead_intelligence_runtime', 'public', 'usage') as schema_usage,
        has_schema_privilege('realtyflow_lead_intelligence_runtime', 'public', 'create') as schema_create,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_intake_messages', 'select,insert') as intake_select_insert,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_intake_messages', 'update') as intake_update,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_intake_messages', 'delete') as intake_delete,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_analysis_runs', 'select,insert') as analysis_select_insert,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'select,insert') as profiles_select_insert,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'update') as profiles_update,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profile_criteria', 'select,insert') as criteria_select_insert,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_contact_candidates', 'select,insert') as candidates_select_insert,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_contact_candidates', 'delete') as candidates_delete,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'select') as contacts_select,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_intelligence_contact_lookup', 'select') as contact_lookup_select,
        has_function_privilege('realtyflow_lead_intelligence_runtime', 'public.set_lead_intelligence_updated_at()', 'execute') as trigger_execute
    `);
    assert(grants.rows[0].schema_usage === true, "Runtime role lacks schema USAGE.");
    assert(grants.rows[0].schema_create === false, "Runtime role can CREATE in public schema.");
    assert(grants.rows[0].intake_select_insert === true, "Runtime role lacks intake SELECT/INSERT.");
    assert(grants.rows[0].intake_update === false, "Runtime role can UPDATE intakes.");
    assert(grants.rows[0].intake_delete === false, "Runtime role can DELETE intakes.");
    assert(grants.rows[0].analysis_select_insert === true, "Runtime role lacks analysis SELECT/INSERT.");
    assert(grants.rows[0].profiles_select_insert === true, "Runtime role lacks profile SELECT/INSERT.");
    assert(grants.rows[0].profiles_update === false, "Runtime role can UPDATE profiles.");
    assert(grants.rows[0].criteria_select_insert === true, "Runtime role lacks criteria SELECT/INSERT.");
    assert(grants.rows[0].candidates_select_insert === true, "Runtime role lacks candidate SELECT/INSERT.");
    assert(grants.rows[0].candidates_delete === false, "Runtime role can DELETE candidates.");
    assert(grants.rows[0].contacts_select === false, "Runtime role can SELECT public.contacts directly.");
    assert(grants.rows[0].contact_lookup_select === true, "Runtime role lacks contact lookup view SELECT.");
    assert(grants.rows[0].trigger_execute === false, "Runtime role can execute trigger function.");

    const candidateUpdateGrants = await client.query(`
      select
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_contact_candidates', 'score', 'update') as score_update,
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_contact_candidates', 'reasons', 'update') as reasons_update,
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_contact_candidates', 'status', 'update') as status_update,
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_contact_candidates', 'brand', 'update') as brand_update,
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_contact_candidates', 'intake_id', 'update') as intake_update,
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_contact_candidates', 'contact_id', 'update') as contact_update
    `);
    assert(candidateUpdateGrants.rows[0].score_update === true, "Runtime role cannot update candidate score.");
    assert(candidateUpdateGrants.rows[0].reasons_update === true, "Runtime role cannot update candidate reasons.");
    assert(candidateUpdateGrants.rows[0].status_update === true, "Runtime role cannot update candidate status.");
    assert(candidateUpdateGrants.rows[0].brand_update === false, "Runtime role can update candidate brand.");
    assert(candidateUpdateGrants.rows[0].intake_update === false, "Runtime role can update candidate intake_id.");
    assert(candidateUpdateGrants.rows[0].contact_update === false, "Runtime role can update candidate contact_id.");

    const sequencePrivilege = await client.query(`
      select has_sequence_privilege(
        'realtyflow_lead_intelligence_runtime',
        'public.sensitive_sequence',
        'usage'
      ) as sequence_usage
    `);
    assert(sequencePrivilege.rows[0].sequence_usage === false, "Runtime role has sequence usage.");

    await assertNoPublicRuntimeTableGrants(client);
    await assertLeadIntelligenceRuntimePolicySet(client);

    process.stdout.write("  Scenario: runtime inserts/selects only through server brand context\n");
    await client.query(`
      insert into public.contacts (brand, name, phone, email, secret_note)
      values
        ('soleada', 'Emmadale', '+4790174714', null, 'private soleada note'),
        ('zeneco', 'Other Contact', '+34999999999', 'other@example.test', 'private zeneco note')
    `);

    const contactRows = await queryAsRuntime(
      client,
      "soleada",
      "select id, brand, name, phone, email from public.lead_intelligence_contact_lookup order by name",
    );
    assert(contactRows.rows.length === 1, "Runtime role did not enforce contact brand policy.");
    assert(contactRows.rows[0].brand === "soleada", "Runtime role selected a cross-brand contact.");

    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "select id, brand, name, phone, email from public.contacts",
      "Runtime role could read contacts directly.",
      "permission denied",
    );
    await assertRejectsRuntimeQuery(
      client,
      null,
      "insert into public.lead_intake_messages (brand, source, status, created_by, correlation_id, idempotency_key) values ('soleada', 'phone_call', 'draft', 'freddy.bremseth@gmail.com', 'rf_noctx_0123456789abcdef0123', 'runtime-no-context')",
      "Runtime role inserted without brand context.",
      "row-level security",
    );

    await client.query("alter table public.contacts disable row level security");
    const contactRowsWithoutContactsRls = await queryAsRuntime(
      client,
      "soleada",
      "select id, brand, name, phone, email from public.lead_intelligence_contact_lookup order by name",
    );
    assert(
      contactRowsWithoutContactsRls.rows.length === 1 &&
        contactRowsWithoutContactsRls.rows[0].brand === "soleada",
      "Contact lookup view leaked cross-brand rows when contacts RLS was disabled.",
    );
    await client.query("alter table public.contacts enable row level security");

    const rowsAfterCommittedContext = await queryAsRuntime(
      client,
      null,
      "select id from public.lead_intelligence_contact_lookup",
    );
    assert(rowsAfterCommittedContext.rows.length === 0, "Brand context leaked between runtime requests.");

    const intake = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_intake_messages (
          brand,
          source,
          status,
          created_by,
          correlation_id,
          idempotency_key
        )
        values ('soleada', 'phone_call', 'draft', 'freddy.bremseth@gmail.com', 'rf_runtime_0123456789abcdef0123', 'runtime-intake-001')
        returning id
      `,
    );
    const intakeId = intake.rows[0].id;

    const analysis = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_analysis_runs (
          intake_id,
          idempotency_key,
          prompt_version,
          model,
          result_json,
          validation_status,
          repaired,
          duration_ms,
          approved,
          approved_by,
          approved_at
        )
        values ($1, 'runtime-analysis-001', 'lead-intelligence-extraction-v1', 'mock', $2::jsonb, 'valid', false, 10, true, 'freddy.bremseth@gmail.com', now())
        returning id
      `,
      [intakeId, { reviewPayloadHash: `sha256:v1:${"a".repeat(64)}` }],
    );
    assert(analysis.rows.length === 1, "Runtime role could not insert analysis run.");

    const profile = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.buyer_profiles (
          brand,
          intake_id,
          version,
          status,
          purchase_readiness,
          budget_amount,
          budget_currency,
          budget_includes_costs,
          budget_approximate,
          location_flexible,
          summary,
          created_by,
          approved_by,
          approved_at
        )
        values ('soleada', $1, 1, 'approved', 'ready_to_buy', 440000, 'EUR', true, true, true, 'Runtime profile', 'freddy.bremseth@gmail.com', 'freddy.bremseth@gmail.com', now())
        returning id
      `,
      [intakeId],
    );
    const profileId = profile.rows[0].id;

    await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.buyer_profile_criteria (
          buyer_profile_id,
          criterion_type,
          key,
          operator,
          value,
          applies_to_property_types,
          source,
          source_text,
          confidence,
          approval_status,
          approved_by,
          approved_at,
          active
        )
        values ($1, 'hard_requirement', 'bedrooms', 'gte', '2'::jsonb, array['apartment']::text[], 'ai_suggestion', 'Minst 2 soverom.', 0.9, 'approved', 'freddy.bremseth@gmail.com', now(), true)
      `,
      [profileId],
    );

    const appStyleCriteria = await queryAsRuntime(
      client,
      "soleada",
      `
        with criteria_input as (
          select
            criterion_type,
            key,
            other_key,
            operator,
            value,
            weight,
            severity,
            coalesce(
              array(
                select jsonb_array_elements_text(coalesce(applies_to_property_types, '[]'::jsonb))
              ),
              '{}'::text[]
            ) as applies_to_property_types,
            source,
            source_text,
            confidence,
            customer_confirmed,
            approval_status,
            approved_by,
            approved_at,
            active
          from jsonb_to_recordset($2::jsonb) as criterion (
            criterion_type text,
            key text,
            other_key text,
            operator text,
            value jsonb,
            weight numeric,
            severity text,
            applies_to_property_types jsonb,
            source text,
            source_text text,
            confidence numeric,
            customer_confirmed boolean,
            approval_status text,
            approved_by text,
            approved_at timestamptz,
            active boolean
          )
        )
        insert into public.buyer_profile_criteria (
          buyer_profile_id,
          criterion_type,
          key,
          other_key,
          operator,
          value,
          weight,
          severity,
          applies_to_property_types,
          source,
          source_text,
          confidence,
          customer_confirmed,
          approval_status,
          approved_by,
          approved_at,
          active
        )
        select
          $1,
          criterion_type,
          key,
          other_key,
          operator,
          value,
          weight,
          severity,
          applies_to_property_types,
          source,
          source_text,
          confidence,
          customer_confirmed,
          approval_status,
          approved_by,
          approved_at,
          active
        from criteria_input
        returning applies_to_property_types
      `,
      [
        profileId,
        JSON.stringify([
          {
            criterion_type: "hard_requirement",
            key: "floor_position",
            other_key: null,
            operator: "eq",
            value: "top_floor",
            weight: null,
            severity: null,
            applies_to_property_types: ["apartment", "penthouse"],
            source: "ai_suggestion",
            source_text: "Må være på toppen.",
            confidence: 0.92,
            customer_confirmed: true,
            approval_status: "approved",
            approved_by: "freddy.bremseth@gmail.com",
            approved_at: new Date().toISOString(),
            active: true,
          },
        ]),
      ],
    );
    assert(
      appStyleCriteria.rows.length === 1,
      "Runtime role could not insert app-style JSON criteria batch.",
    );
    assert(
      appStyleCriteria.rows[0].applies_to_property_types.includes("penthouse"),
      "App-style JSON criteria batch did not preserve property type arrays.",
    );

    await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_contact_candidates (
          brand,
          intake_id,
          contact_id,
          match_type,
          match_value_hash,
          score,
          reasons,
          status
        )
        values ('soleada', $1, gen_random_uuid(), 'exact_phone', 'hmac-sha256:v1:' || repeat('d', 64), 0.98, '["first candidate"]'::jsonb, 'suggested')
        on conflict (intake_id, match_type, match_value_hash)
        do update set score = excluded.score, reasons = excluded.reasons, status = excluded.status
      `,
      [intakeId],
    );
    await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_contact_candidates (
          brand,
          intake_id,
          contact_id,
          match_type,
          match_value_hash,
          score,
          reasons,
          status
        )
        values ('soleada', $1, gen_random_uuid(), 'exact_phone', 'hmac-sha256:v1:' || repeat('d', 64), 0.99, '["updated candidate"]'::jsonb, 'selected')
        on conflict (intake_id, match_type, match_value_hash)
        do update set score = excluded.score, reasons = excluded.reasons, status = excluded.status
      `,
      [intakeId],
    );
    const candidateRows = await queryAsRuntime(
      client,
      "soleada",
      "select score, status from public.lead_contact_candidates where intake_id = $1",
      [intakeId],
    );
    assert(candidateRows.rows.length === 1, "Candidate upsert inserted duplicate rows.");
    assert(Number(candidateRows.rows[0].score) === 0.99, "Candidate upsert did not update score.");
    assert(candidateRows.rows[0].status === "selected", "Candidate upsert did not update status.");

    process.stdout.write("  Scenario: forbidden runtime mutations and cross-brand access are blocked\n");
    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      `
        insert into public.lead_intake_messages (brand, source, status, created_by, correlation_id, idempotency_key)
        values ('zeneco', 'phone_call', 'draft', 'freddy.bremseth@gmail.com', 'rf_cross_0123456789abcdef0123', 'runtime-cross-brand')
      `,
      "Runtime role inserted a cross-brand intake.",
      "row-level security",
    );
    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "update public.lead_intake_messages set status = 'approved' where id is not null",
      "Runtime role updated intakes.",
      "permission denied",
    );
    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "update public.buyer_profiles set status = 'archived' where id is not null",
      "Runtime role updated buyer profiles.",
      "permission denied",
    );
    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "delete from public.lead_contact_candidates where id is not null",
      "Runtime role deleted candidates.",
      "permission denied",
    );
    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "create table public.runtime_should_not_create (id uuid)",
      "Runtime role created a table.",
      "permission denied",
    );

    await client.query(`
      insert into public.lead_intake_messages (
        brand,
        source,
        status,
        created_by,
        correlation_id,
        idempotency_key
      )
      values ('zeneco', 'phone_call', 'draft', 'freddy.bremseth@gmail.com', 'rf_zeneco_0123456789abcdef012', 'zeneco-intake-001')
    `);
    const visibleIntakes = await queryAsRuntime(
      client,
      "soleada",
      "select brand from public.lead_intake_messages order by brand",
    );
    assert(
      visibleIntakes.rows.every((row) => row.brand === "soleada"),
      "Runtime role selected cross-brand Lead Intelligence rows.",
    );

    process.stdout.write("  Scenario: sensitive application tables stay inaccessible\n");
    for (const tableName of [
      "public.leads",
      "public.email_messages",
      "public.oauth_tokens",
      "storage.objects",
    ]) {
      await assertRejectsRuntimeQuery(
        client,
        "soleada",
        `select * from ${tableName} limit 1`,
        `Runtime role could read ${tableName}.`,
        "permission denied",
      );
    }
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: existing safe runtime role passes audit\n");
    await client.query("create role realtyflow_lead_intelligence_runtime login noinherit connection limit 5");
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);
    const { rows } = await client.query(`
      select rolcanlogin, rolinherit, rolbypassrls, rolconnlimit
      from pg_roles
      where rolname = 'realtyflow_lead_intelligence_runtime'
    `);
    assert(rows[0].rolcanlogin === true, "Existing safe runtime role is not LOGIN.");
    assert(rows[0].rolinherit === false, "Existing safe runtime role is not NOINHERIT.");
    assert(rows[0].rolbypassrls === false, "Existing runtime role has BYPASSRLS.");
    assert(Number(rows[0].rolconnlimit) === 5, "Existing safe runtime role connection limit changed.");
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: existing runtime role connection limit is normalized\n");
    await client.query("create role realtyflow_lead_intelligence_runtime login noinherit connection limit -1");
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);
    const { rows } = await client.query(`
      select rolconnlimit
      from pg_roles
      where rolname = 'realtyflow_lead_intelligence_runtime'
    `);
    assert(Number(rows[0].rolconnlimit) === 5, "Existing unlimited runtime role was not normalized.");
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: production-like non-superuser migration runner can apply runtime RLS\n");
    await client.query(`
      create role lead_intelligence_migration_runner login createrole noinherit;
      alter schema public owner to lead_intelligence_migration_runner;
      alter table public.contacts owner to lead_intelligence_migration_runner;
      alter table public.leads owner to lead_intelligence_migration_runner;
      alter table public.email_messages owner to lead_intelligence_migration_runner;
      alter table public.oauth_tokens owner to lead_intelligence_migration_runner;
      alter sequence public.sensitive_sequence owner to lead_intelligence_migration_runner;
      alter table public.lead_intake_messages owner to lead_intelligence_migration_runner;
      alter table public.lead_analysis_runs owner to lead_intelligence_migration_runner;
      alter table public.buyer_profiles owner to lead_intelligence_migration_runner;
      alter table public.buyer_profile_criteria owner to lead_intelligence_migration_runner;
      alter table public.lead_contact_candidates owner to lead_intelligence_migration_runner;
      alter function public.set_lead_intelligence_updated_at() owner to lead_intelligence_migration_runner;
    `);
    await applyMigrationAsRole(
      client,
      migrationFiles.leadIntelligenceRuntimeRls,
      "lead_intelligence_migration_runner",
    );
    const { rows } = await client.query(`
      select rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls, rolconnlimit
      from pg_roles
      where rolname = 'realtyflow_lead_intelligence_runtime'
    `);
    assert(rows[0].rolsuper === false, "Production-like runtime role became SUPERUSER.");
    assert(rows[0].rolcreatedb === false, "Production-like runtime role can create databases.");
    assert(rows[0].rolcreaterole === false, "Production-like runtime role can create roles.");
    assert(rows[0].rolinherit === false, "Production-like runtime role unexpectedly inherits.");
    assert(rows[0].rolbypassrls === false, "Production-like runtime role has BYPASSRLS.");
    assert(Number(rows[0].rolconnlimit) === 5, "Production-like runtime role connection limit is not 5.");
    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "select id from public.contacts limit 1",
      "Production-like runtime role could read contacts directly.",
      "permission denied",
    );
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: production-like admin-only creator membership passes effective audit\n");
    await client.query(`
      create role lead_intelligence_migration_owner nologin;
      create role realtyflow_lead_intelligence_runtime login noinherit connection limit 5;
      grant realtyflow_lead_intelligence_runtime to lead_intelligence_migration_owner
        with admin true, inherit false, set false;
    `);
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);
    const { rows: incomingRows } = await client.query(`
      select count(*)::int as count
      from pg_auth_members
      where roleid = 'realtyflow_lead_intelligence_runtime'::regrole
    `);
    assert(
      incomingRows[0].count === 1,
      "Runtime migration should tolerate one admin-only creator membership.",
    );
    const { rows: membershipRows } = await client.query(`
      select admin_option, inherit_option, set_option
      from pg_auth_members
      where roleid = 'realtyflow_lead_intelligence_runtime'::regrole
        and member = 'lead_intelligence_migration_owner'::regrole
    `);
    assert(membershipRows.length === 1, "Expected creator membership to remain visible for audit.");
    assert(membershipRows[0].admin_option === true, "Creator membership should preserve ADMIN metadata.");
    assert(membershipRows[0].inherit_option === false, "Creator membership must not inherit runtime privileges.");
    assert(membershipRows[0].set_option === false, "Creator membership must not allow SET ROLE.");
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: incoming runtime membership with SET fails closed\n");
    await client.query(`
      create role lead_intelligence_runtime_set_member nologin;
      create role realtyflow_lead_intelligence_runtime login noinherit connection limit 5;
      grant realtyflow_lead_intelligence_runtime to lead_intelligence_runtime_set_member
        with admin false, inherit false, set true;
    `);
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted incoming membership with SET option.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: harmless noinherit/noset membership can pass effective audit\n");
    await client.query(`
      create role lead_intelligence_runtime_safe_parent nologin;
      create role realtyflow_lead_intelligence_runtime login noinherit connection limit 5;
      grant lead_intelligence_runtime_safe_parent to realtyflow_lead_intelligence_runtime
        with admin false, inherit false, set false;
    `);
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);
    const { rows: safeMembershipRows } = await client.query(`
      select admin_option, inherit_option, set_option
      from pg_auth_members
      where member = 'realtyflow_lead_intelligence_runtime'::regrole
        and roleid = 'lead_intelligence_runtime_safe_parent'::regrole
    `);
    assert(safeMembershipRows.length === 1, "Safe noinherit/noset membership was unexpectedly removed.");
    assert(safeMembershipRows[0].admin_option === false, "Safe membership unexpectedly has ADMIN option.");
    assert(safeMembershipRows[0].inherit_option === false, "Safe membership unexpectedly has INHERIT option.");
    assert(safeMembershipRows[0].set_option === false, "Safe membership unexpectedly has SET option.");
    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "select * from public.oauth_tokens limit 1",
      "Runtime role could read a sensitive table through harmless membership.",
      "permission denied",
    );
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: runtime role as member of dangerous role fails closed\n");
    await client.query(`
      create role lead_intelligence_runtime_dangerous_parent nologin createdb;
      create role realtyflow_lead_intelligence_runtime login noinherit connection limit 5;
      grant lead_intelligence_runtime_dangerous_parent to realtyflow_lead_intelligence_runtime
        with admin false, inherit false, set false;
    `);
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted membership in a dangerous role.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );

    await client.query(`
      revoke lead_intelligence_runtime_dangerous_parent from realtyflow_lead_intelligence_runtime;
      drop role realtyflow_lead_intelligence_runtime;
      drop role lead_intelligence_runtime_dangerous_parent;
    `);
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: inherited sensitive SELECT through membership fails closed\n");
    await client.query(`
      create role lead_intelligence_runtime_parent nologin;
      grant select on public.oauth_tokens to lead_intelligence_runtime_parent;
      create role realtyflow_lead_intelligence_runtime login noinherit connection limit 5;
      grant lead_intelligence_runtime_parent to realtyflow_lead_intelligence_runtime
        with admin false, inherit true, set false;
    `);
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted inherited sensitive table access.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );

    await client.query(`
      revoke lead_intelligence_runtime_parent from realtyflow_lead_intelligence_runtime;
      drop role realtyflow_lead_intelligence_runtime;
      drop owned by lead_intelligence_runtime_parent;
      drop role lead_intelligence_runtime_parent;
    `);
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: existing runtime role with ownership fails closed\n");
    await client.query(`
      create role realtyflow_lead_intelligence_runtime login noinherit connection limit 5;
      create table public.runtime_owned_table (id integer);
      alter table public.runtime_owned_table owner to realtyflow_lead_intelligence_runtime;
    `);
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted a role that owns database objects.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );

    await client.query(`
      drop table public.runtime_owned_table;
      drop role realtyflow_lead_intelligence_runtime;
    `);
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: existing runtime role with BYPASSRLS fails closed\n");
    await client.query("create role realtyflow_lead_intelligence_runtime login bypassrls connection limit 5");
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted a BYPASSRLS role.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );

    await client.query("drop role realtyflow_lead_intelligence_runtime");
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: existing runtime role with SUPERUSER fails closed\n");
    await client.query("create role realtyflow_lead_intelligence_runtime login superuser noinherit connection limit 5");
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted a SUPERUSER role.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );

    await client.query("drop role realtyflow_lead_intelligence_runtime");
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: existing runtime role with CREATEDB fails closed\n");
    await client.query("create role realtyflow_lead_intelligence_runtime login createdb noinherit connection limit 5");
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted a CREATEDB role.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );

    await client.query("drop role realtyflow_lead_intelligence_runtime");
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: existing runtime role with CREATEROLE fails closed\n");
    await client.query("create role realtyflow_lead_intelligence_runtime login createrole noinherit connection limit 5");
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted a CREATEROLE role.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );

    await client.query("drop role realtyflow_lead_intelligence_runtime");
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: existing runtime role with INHERIT fails closed\n");
    await client.query("create role realtyflow_lead_intelligence_runtime login inherit connection limit 5");
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted an INHERIT role.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );

    await client.query("drop role realtyflow_lead_intelligence_runtime");
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: existing runtime role with schema CREATE fails closed\n");
    await client.query(`
      create role realtyflow_lead_intelligence_runtime login noinherit connection limit 5;
      grant create on schema public to realtyflow_lead_intelligence_runtime;
    `);
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted schema CREATE.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );

    await client.query(`
      revoke create on schema public from realtyflow_lead_intelligence_runtime;
      drop role realtyflow_lead_intelligence_runtime;
    `);
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: existing runtime role with direct contacts SELECT fails closed\n");
    await client.query(`
      create role realtyflow_lead_intelligence_runtime login noinherit connection limit 5;
      grant select on public.contacts to realtyflow_lead_intelligence_runtime;
    `);
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted direct contacts SELECT.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );

    await client.query(`
      revoke select on public.contacts from realtyflow_lead_intelligence_runtime;
      drop role realtyflow_lead_intelligence_runtime;
    `);
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: existing runtime role with sensitive table SELECT fails closed\n");
    await client.query(`
      create role realtyflow_lead_intelligence_runtime login noinherit connection limit 5;
      grant select on public.oauth_tokens to realtyflow_lead_intelligence_runtime;
    `);
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted sensitive table SELECT.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );

    await client.query(`
      revoke select on public.oauth_tokens from realtyflow_lead_intelligence_runtime;
      drop role realtyflow_lead_intelligence_runtime;
    `);
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await dropLeadIntelligenceRuntimeTestRole(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);

    process.stdout.write("  Scenario: existing runtime role with sequence privilege fails closed\n");
    await client.query(`
      create role realtyflow_lead_intelligence_runtime login noinherit connection limit 5;
      grant usage on sequence public.sensitive_sequence to realtyflow_lead_intelligence_runtime;
    `);
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted sequence USAGE.",
      "LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE",
    );

    await client.query(`
      revoke usage on sequence public.sensitive_sequence from realtyflow_lead_intelligence_runtime;
      drop role realtyflow_lead_intelligence_runtime;
    `);
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);

    process.stdout.write("  Scenario: missing PR 3A schema fails closed\n");
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted missing PR 3A schema.",
      "LEAD_INTELLIGENCE_RUNTIME_SCHEMA_NOT_READY",
    );
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await client.query(`
      create table public.lead_intake_messages (id uuid primary key default gen_random_uuid());
      comment on table public.lead_intake_messages is 'Lead Intelligence persistence foundation v1';
      create table public.lead_analysis_runs (id uuid primary key default gen_random_uuid());
      comment on table public.lead_analysis_runs is 'Lead Intelligence persistence foundation v1';
      create table public.buyer_profiles (id uuid primary key default gen_random_uuid());
      comment on table public.buyer_profiles is 'Lead Intelligence persistence foundation v1';
      create table public.buyer_profile_criteria (id uuid primary key default gen_random_uuid());
      comment on table public.buyer_profile_criteria is 'Lead Intelligence persistence foundation v1';
      create table public.lead_contact_candidates (id uuid primary key default gen_random_uuid());
      comment on table public.lead_contact_candidates is 'Lead Intelligence persistence foundation v1';
    `);

    process.stdout.write("  Scenario: incompatible PR 3A schema fails closed\n");
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceRuntimeRls, "utf8"),
      "Runtime migration accepted incompatible PR 3A schema.",
      "LEAD_INTELLIGENCE_RUNTIME_SCHEMA_INCOMPATIBLE",
    );
  });
}

async function testLeadIntelligenceContactLinkGate() {
  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await client.query("revoke create on schema public from public");

    process.stdout.write("  Scenario: applies after runtime RLS and is idempotent\n");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);
    await applyMigration(client, migrationFiles.leadIntelligenceContactLinkGate);
    await applyMigration(client, migrationFiles.leadIntelligenceContactLinkGate);

    const grants = await client.query(`
      select
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'contact_id', 'update') as contact_update,
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'summary', 'update') as summary_update,
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'status', 'update') as status_update,
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'brand', 'update') as brand_update,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'delete') as profile_delete,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'select') as contacts_select,
        has_table_privilege('anon', 'public.buyer_profiles', 'update') as anon_profile_update,
        has_table_privilege('authenticated', 'public.buyer_profiles', 'update') as authenticated_profile_update
    `);
    assert(grants.rows[0].contact_update === true, "Runtime role cannot update buyer_profiles.contact_id.");
    assert(grants.rows[0].summary_update === false, "Runtime role can update buyer profile summary.");
    assert(grants.rows[0].status_update === false, "Runtime role can update buyer profile status.");
    assert(grants.rows[0].brand_update === false, "Runtime role can update buyer profile brand.");
    assert(grants.rows[0].profile_delete === false, "Runtime role can delete buyer profiles.");
    assert(grants.rows[0].contacts_select === false, "Runtime role can read public.contacts directly.");
    assert(grants.rows[0].anon_profile_update === false, "anon can update buyer_profiles.");
    assert(grants.rows[0].authenticated_profile_update === false, "authenticated can update buyer_profiles.");

    const policyRows = await client.query(`
      select
        cmd,
        roles::text as roles,
        qual,
        with_check
      from pg_policies
      where schemaname = 'public'
        and tablename = 'buyer_profiles'
        and policyname = 'buyer_profiles_runtime_contact_link'
    `);
    assert(policyRows.rows.length === 1, "Contact-link update policy is missing.");
    assert(policyRows.rows[0].cmd === "UPDATE", "Contact-link policy is not an UPDATE policy.");
    assert(
      policyRows.rows[0].roles.includes("realtyflow_lead_intelligence_runtime"),
      "Contact-link policy is not scoped to the runtime role.",
    );
    assert(
      String(policyRows.rows[0].with_check || "").includes("lead_intelligence_contact_lookup"),
      "Contact-link policy does not require the same-brand contact lookup view.",
    );
    assert(
      String(policyRows.rows[0].qual || "").includes("contact_id IS NULL") ||
        String(policyRows.rows[0].qual || "").includes("contact_id is null"),
      "Contact-link policy does not require an unlinked existing profile.",
    );

    process.stdout.write("  Scenario: runtime links only same-brand contacts through lookup view\n");
    const contactInsert = await client.query(`
      insert into public.contacts (brand, name, phone, email, secret_note)
      values
        ('soleada', 'Emmadale', '+4790174714', 'emmadale@example.test', 'private soleada note'),
        ('zeneco', 'Other Contact', '+34999999999', 'other@example.test', 'private zeneco note')
      returning id::text, brand
    `);
    const soleadaContactId = contactInsert.rows.find((row) => row.brand === "soleada").id;
    const zenecoContactId = contactInsert.rows.find((row) => row.brand === "zeneco").id;

    const intake = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_intake_messages (
          brand,
          source,
          status,
          created_by,
          correlation_id,
          idempotency_key
        )
        values ('soleada', 'phone_call', 'approved', 'freddy.bremseth@gmail.com', 'rf_link_0123456789abcdef0123', 'contact-link-intake-001')
        returning id::text
      `,
    );
    const intakeId = intake.rows[0].id;

    const profile = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.buyer_profiles (
          brand,
          contact_id,
          intake_id,
          version,
          status,
          purchase_readiness,
          budget_amount,
          budget_currency,
          budget_includes_costs,
          budget_approximate,
          location_flexible,
          summary,
          created_by,
          approved_by,
          approved_at
        )
        values ('soleada', null, $1::uuid, 1, 'approved', 'ready_to_buy', 440000, 'EUR', true, true, true, 'Approved buyer profile.', 'freddy.bremseth@gmail.com', 'freddy.bremseth@gmail.com', now())
        returning id::text
      `,
      [intakeId],
    );
    const profileId = profile.rows[0].id;

    const linkedProfile = await queryAsRuntime(
      client,
      "soleada",
      `
        update public.buyer_profiles
        set contact_id = $1::uuid
        where id = $2::uuid
        returning contact_id::text
      `,
      [soleadaContactId, profileId],
    );
    assert(linkedProfile.rows[0].contact_id === soleadaContactId, "Runtime did not link same-brand contact.");

    const repeatLink = await queryAsRuntime(
      client,
      "soleada",
      `
        update public.buyer_profiles
        set contact_id = $1::uuid
        where id = $2::uuid
        returning contact_id::text
      `,
      [soleadaContactId, profileId],
    );
    assert(repeatLink.rows.length === 0, "Raw runtime SQL could relink an already linked profile.");

    const profileForCrossBrand = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.buyer_profiles (
          brand,
          contact_id,
          intake_id,
          version,
          status,
          purchase_readiness,
          budget_amount,
          budget_currency,
          budget_includes_costs,
          budget_approximate,
          location_flexible,
          summary,
          created_by,
          approved_by,
          approved_at
        )
        values ('soleada', null, $1::uuid, 2, 'approved', 'ready_to_buy', 440000, 'EUR', true, true, true, 'Second buyer profile.', 'freddy.bremseth@gmail.com', 'freddy.bremseth@gmail.com', now())
        returning id::text
      `,
      [intakeId],
    );

    let crossBrandRejected = false;
    try {
      await queryAsRuntime(
        client,
        "soleada",
        `
          update public.buyer_profiles
          set contact_id = $1::uuid
          where id = $2::uuid
          returning contact_id::text
        `,
        [zenecoContactId, profileForCrossBrand.rows[0].id],
      );
    } catch (error) {
      crossBrandRejected = true;
      assert(
        error instanceof Error && error.message.includes("row-level security"),
        "Cross-brand contact link failed for an unexpected reason.",
      );
    }
    assert(crossBrandRejected, "Runtime linked a cross-brand contact.");

    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "select id, brand, name, phone, email from public.contacts",
      "Runtime role could read contacts directly after contact-link migration.",
      "permission denied",
    );
    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "update public.buyer_profiles set summary = 'changed'",
      "Runtime role could update buyer profile summary.",
      "permission denied",
    );
    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "delete from public.buyer_profiles where id is not null",
      "Runtime role could delete buyer profiles.",
      "permission denied",
    );
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await client.query("revoke create on schema public from public");

    process.stdout.write("  Scenario: missing runtime RLS schema fails closed\n");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceContactLinkGate, "utf8"),
      "Contact-link migration accepted missing runtime RLS schema.",
      "LEAD_INTELLIGENCE_CONTACT_LINK_SCHEMA_NOT_READY",
    );
  });
}

async function testLeadIntelligenceProfileActions() {
  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await client.query("revoke create on schema public from public");

    process.stdout.write("  Scenario: applies after runtime/contact-link gates and is idempotent\n");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);
    await applyMigration(client, migrationFiles.leadIntelligenceContactLinkGate);
    await applyMigration(client, migrationFiles.leadIntelligenceProfileActions);
    await applyMigration(client, migrationFiles.leadIntelligenceProfileActions);

    const grants = await client.query(`
      select
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'status', 'update') as status_update,
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'contact_id', 'update') as contact_update,
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'summary', 'update') as summary_update,
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'brand', 'update') as brand_update,
        has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'intake_id', 'update') as intake_update,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'delete') as profile_delete,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'select') as contacts_select,
        has_table_privilege('anon', 'public.buyer_profiles', 'select,insert,update,delete') as anon_profile_access,
        has_table_privilege('authenticated', 'public.buyer_profiles', 'select,insert,update,delete') as authenticated_profile_access
    `);
    assert(grants.rows[0].status_update === true, "Runtime role cannot update buyer_profiles.status.");
    assert(grants.rows[0].contact_update === true, "Contact-link gate update(contact_id) was lost.");
    assert(grants.rows[0].summary_update === false, "Runtime role can update buyer profile summary.");
    assert(grants.rows[0].brand_update === false, "Runtime role can update buyer profile brand.");
    assert(grants.rows[0].intake_update === false, "Runtime role can update buyer profile intake_id.");
    assert(grants.rows[0].profile_delete === false, "Runtime role can delete buyer profiles.");
    assert(grants.rows[0].contacts_select === false, "Runtime role can read public.contacts directly.");
    assert(grants.rows[0].anon_profile_access === false, "anon can access buyer_profiles.");
    assert(grants.rows[0].authenticated_profile_access === false, "authenticated can access buyer_profiles.");

    const policyRows = await client.query(`
      select
        cmd,
        roles::text as roles,
        qual,
        with_check
      from pg_policies
      where schemaname = 'public'
        and tablename = 'buyer_profiles'
        and policyname = 'buyer_profiles_runtime_archive'
    `);
    assert(policyRows.rows.length === 1, "Profile archive update policy is missing.");
    assert(policyRows.rows[0].cmd === "UPDATE", "Profile archive policy is not an UPDATE policy.");
    assert(
      policyRows.rows[0].roles.includes("realtyflow_lead_intelligence_runtime"),
      "Profile archive policy is not scoped to the runtime role.",
    );
    assert(
      String(policyRows.rows[0].with_check || "").includes("status = 'archived'"),
      "Profile archive policy does not constrain the target status to archived.",
    );

    process.stdout.write("  Scenario: runtime can soft-archive only same-brand draft/approved profiles\n");
    const intake = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_intake_messages (
          brand,
          source,
          status,
          created_by,
          correlation_id,
          idempotency_key
        )
        values ('soleada', 'phone_call', 'approved', 'freddy.bremseth@gmail.com', 'rf_archive_0123456789abcdef01', 'profile-actions-intake-001')
        returning id::text
      `,
    );
    const intakeId = intake.rows[0].id;

    const profile = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.buyer_profiles (
          brand,
          contact_id,
          intake_id,
          version,
          status,
          purchase_readiness,
          budget_amount,
          budget_currency,
          budget_includes_costs,
          budget_approximate,
          location_flexible,
          summary,
          created_by,
          approved_by,
          approved_at
        )
        values ('soleada', null, $1::uuid, 1, 'approved', 'ready_to_buy', 440000, 'EUR', true, true, true, 'Archive candidate.', 'freddy.bremseth@gmail.com', 'freddy.bremseth@gmail.com', now())
        returning id::text
      `,
      [intakeId],
    );
    const profileId = profile.rows[0].id;

    const archived = await queryAsRuntime(
      client,
      "soleada",
      `
        update public.buyer_profiles
        set status = 'archived'
        where id = $1::uuid
        returning status
      `,
      [profileId],
    );
    assert(archived.rows[0].status === "archived", "Runtime role did not archive same-brand profile.");

    const archivedAgain = await queryAsRuntime(
      client,
      "soleada",
      `
        update public.buyer_profiles
        set status = 'archived'
        where id = $1::uuid
        returning status
      `,
      [profileId],
    );
    assert(archivedAgain.rows.length === 0, "Raw runtime SQL could re-update an already archived profile.");

    const crossBrand = await queryAsRuntime(
      client,
      "zeneco",
      `
        update public.buyer_profiles
        set status = 'archived'
        where id = $1::uuid
        returning status
      `,
      [profileId],
    );
    assert(crossBrand.rows.length === 0, "Runtime role archived a cross-brand profile.");

    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "update public.buyer_profiles set summary = 'changed'",
      "Runtime role could update buyer profile summary.",
      "permission denied",
    );
    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "delete from public.buyer_profiles where id is not null",
      "Runtime role could hard-delete buyer profiles.",
      "permission denied",
    );
    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "select id, brand, name, phone, email from public.contacts",
      "Runtime role could read contacts directly after profile-actions migration.",
      "permission denied",
    );
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await client.query("revoke create on schema public from public");

    process.stdout.write("  Scenario: missing runtime RLS schema fails closed\n");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceProfileActions, "utf8"),
      "Profile-actions migration accepted missing runtime RLS schema.",
      "LEAD_INTELLIGENCE_PROFILE_ACTIONS_SCHEMA_NOT_READY",
    );
  });
}

async function testLeadIntelligenceCrmContextReadonly() {
  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await client.query("revoke create on schema public from public");

    process.stdout.write("  Scenario: applies after runtime RLS and is idempotent\n");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);
    await applyMigration(client, migrationFiles.leadIntelligenceCrmContext);
    await applyMigration(client, migrationFiles.leadIntelligenceCrmContext);

    const viewRows = await client.query(`
      select
        c.relkind,
        c.reloptions::text as reloptions,
        obj_description(c.oid, 'pg_class') as comment
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'lead_intelligence_crm_context_lookup'
    `);
    assert(viewRows.rows.length === 1, "CRM context view was not created.");
    assert(viewRows.rows[0].relkind === "v", "CRM context object is not a view.");
    assert(
      String(viewRows.rows[0].reloptions || "").includes("security_barrier=true"),
      "CRM context view is not security_barrier.",
    );
    assert(
      String(viewRows.rows[0].comment || "").includes("Lead Intelligence read-only CRM context"),
      "CRM context view comment is missing.",
    );

    process.stdout.write("  Scenario: grants are scoped only to runtime role\n");
    const grants = await client.query(`
      select
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_intelligence_crm_context_lookup', 'select') as runtime_select,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'select') as contacts_select,
        has_table_privilege('anon', 'public.lead_intelligence_crm_context_lookup', 'select') as anon_select,
        has_table_privilege('authenticated', 'public.lead_intelligence_crm_context_lookup', 'select') as authenticated_select
    `);
    assert(grants.rows[0].runtime_select === true, "Runtime role cannot select CRM context view.");
    assert(grants.rows[0].contacts_select === false, "Runtime role can select contacts directly.");
    assert(grants.rows[0].anon_select === false, "anon can select CRM context view.");
    assert(grants.rows[0].authenticated_select === false, "authenticated can select CRM context view.");

    const publicGrants = await client.query(`
      select count(*)::int as count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
      where n.nspname = 'public'
        and c.relname = 'lead_intelligence_crm_context_lookup'
        and acl.grantee = 0
        and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    `);
    assert(publicGrants.rows[0].count === 0, "PUBLIC has access to CRM context view.");

    process.stdout.write("  Scenario: runtime view filters by transaction brand context\n");
    await client.query(`
      insert into public.contacts (
        brand,
        name,
        phone,
        email,
        pipeline_status,
        pipeline_value,
        property_interest,
        source,
        sentiment,
        notes,
        interactions,
        last_contact,
        next_followup
      )
      values
        (
          'soleada',
          'Emmadale',
          '+4790174714',
          'emmadale@example.test',
          'qualified',
          440000,
          'Penthouse eller enderekkehus',
          'phone_call',
          'positive',
          repeat('safe note ', 80),
          '[{"type":"call"},{"type":"email"}]'::jsonb,
          '2026-06-21T10:00:00Z',
          '2026-06-23T10:00:00Z'
        ),
        (
          'zeneco',
          'Other Contact',
          '+34999999999',
          'other@example.test',
          'hot',
          900000,
          'Villa',
          'email',
          'neutral',
          'cross-brand private note',
          '[{"type":"email"}]'::jsonb,
          '2026-06-21T11:00:00Z',
          null
        )
    `);

    const contextRows = await queryAsRuntime(
      client,
      "soleada",
      `
        select
          brand,
          name,
          phone,
          email,
          pipeline_status,
          pipeline_value::int as pipeline_value,
          property_interest,
          source,
          sentiment,
          notes_excerpt,
          interaction_count,
          last_contact,
          next_followup
        from public.lead_intelligence_crm_context_lookup
        order by name
      `,
    );
    assert(contextRows.rows.length === 1, "CRM context view did not enforce brand context.");
    assert(contextRows.rows[0].brand === "soleada", "CRM context leaked cross-brand rows.");
    assert(contextRows.rows[0].pipeline_status === "qualified", "CRM context omitted pipeline status.");
    assert(Number(contextRows.rows[0].pipeline_value) === 440000, "CRM context omitted pipeline value.");
    assert(contextRows.rows[0].property_interest === "Penthouse eller enderekkehus", "CRM context omitted property interest.");
    assert(contextRows.rows[0].interaction_count === 2, "CRM context interaction_count is wrong.");
    assert(String(contextRows.rows[0].notes_excerpt).length <= 500, "CRM context notes excerpt is too long.");

    const emptyContextRows = await queryAsRuntime(
      client,
      null,
      "select id from public.lead_intelligence_crm_context_lookup",
    );
    assert(emptyContextRows.rows.length === 0, "CRM context returned rows without brand context.");

    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "select id, brand, name, phone, email from public.contacts",
      "Runtime role could read contacts directly after CRM context migration.",
      "permission denied",
    );

    await client.query("alter table public.contacts disable row level security");
    const rowsWithoutContactsRls = await queryAsRuntime(
      client,
      "soleada",
      "select brand, name from public.lead_intelligence_crm_context_lookup order by name",
    );
    assert(
      rowsWithoutContactsRls.rows.length === 1 &&
        rowsWithoutContactsRls.rows[0].brand === "soleada",
      "CRM context view leaked cross-brand rows when contacts RLS was disabled.",
    );
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);

    process.stdout.write("  Scenario: incompatible contacts schema fails closed\n");
    await client.query("alter table public.contacts drop column pipeline_status");
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligenceCrmContext, "utf8"),
      "CRM context migration accepted an incompatible contacts schema.",
      "LEAD_INTELLIGENCE_CRM_CONTEXT_SCHEMA_INCOMPATIBLE",
    );
  });
}

async function testLeadIntelligenceShortlistDraft() {
  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await client.query("revoke create on schema public from public");

    process.stdout.write("  Scenario: applies after PR 3A/runtime RLS and is idempotent\n");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);
    await applyMigration(client, migrationFiles.leadIntelligenceShortlistDraft);
    await applyMigration(client, migrationFiles.leadIntelligenceShortlistDraft);

    for (const tableName of ["lead_property_shortlists", "lead_property_shortlist_items"]) {
      assert(await tableExists(client, tableName), `public.${tableName} was not created.`);
      const rls = await client.query(
        "select relrowsecurity from pg_class where oid = format('public.%I', $1::text)::regclass",
        [tableName],
      );
      assert(rls.rows[0].relrowsecurity === true, `RLS is not enabled for public.${tableName}.`);
    }

    await assertTableHasColumns(client, "lead_property_shortlists", [
      "id",
      "brand",
      "buyer_profile_id",
      "status",
      "title",
      "idempotency_key",
      "payload_hash",
      "correlation_id",
      "created_by",
      "created_at",
      "updated_at",
    ]);
    await assertTableHasColumns(client, "lead_property_shortlist_items", [
      "id",
      "shortlist_id",
      "brand",
      "property_id",
      "property_reference",
      "property_title",
      "property_location",
      "rank",
      "decision",
      "system_eligibility",
      "score",
      "data_quality_score",
      "reasons",
      "concerns",
      "questions_to_verify",
      "selected_by",
    ]);

    const grants = await client.query(`
      select
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_property_shortlists', 'select,insert') as shortlists_select_insert,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_property_shortlists', 'update') as shortlists_update,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_property_shortlists', 'delete') as shortlists_delete,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_property_shortlist_items', 'select,insert') as items_select_insert,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_property_shortlist_items', 'update') as items_update,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_property_shortlist_items', 'delete') as items_delete,
        has_table_privilege('anon', 'public.lead_property_shortlists', 'select') as anon_shortlists_select,
        has_table_privilege('authenticated', 'public.lead_property_shortlists', 'select') as authenticated_shortlists_select,
        has_table_privilege('anon', 'public.lead_property_shortlist_items', 'select') as anon_items_select,
        has_table_privilege('authenticated', 'public.lead_property_shortlist_items', 'select') as authenticated_items_select
    `);
    assert(grants.rows[0].shortlists_select_insert === true, "Runtime role lacks shortlist SELECT/INSERT.");
    assert(grants.rows[0].shortlists_update === false, "Runtime role can UPDATE shortlists.");
    assert(grants.rows[0].shortlists_delete === false, "Runtime role can DELETE shortlists.");
    assert(grants.rows[0].items_select_insert === true, "Runtime role lacks shortlist item SELECT/INSERT.");
    assert(grants.rows[0].items_update === false, "Runtime role can UPDATE shortlist items.");
    assert(grants.rows[0].items_delete === false, "Runtime role can DELETE shortlist items.");
    assert(grants.rows[0].anon_shortlists_select === false, "anon can SELECT shortlist drafts.");
    assert(grants.rows[0].authenticated_shortlists_select === false, "authenticated can SELECT shortlist drafts.");
    assert(grants.rows[0].anon_items_select === false, "anon can SELECT shortlist items.");
    assert(grants.rows[0].authenticated_items_select === false, "authenticated can SELECT shortlist items.");

    const policies = await client.query(`
      select polname, polcmd, array(select rolname from pg_roles where oid = any(polroles)) as roles
      from pg_policy
      where polrelid in (
        'public.lead_property_shortlists'::regclass,
        'public.lead_property_shortlist_items'::regclass
      )
      order by polname
    `);
    assert(policies.rows.length === 4, "Expected four shortlist runtime RLS policies.");
    for (const row of policies.rows) {
      assert(
        row.roles.includes("realtyflow_lead_intelligence_runtime"),
        `Policy ${row.polname} is not scoped to runtime role.`,
      );
    }

    process.stdout.write("  Scenario: runtime role can insert/select only with matching brand context\n");
    const intake = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_intake_messages (
          brand,
          source,
          status,
          created_by,
          correlation_id,
          idempotency_key
        )
        values ('soleada', 'phone_call', 'draft', 'freddy.bremseth@gmail.com', 'rf_short_0123456789abcdef0123', 'short-intake-001')
        returning id
      `,
    );
    const intakeId = intake.rows[0].id;
    const profile = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.buyer_profiles (
          brand,
          intake_id,
          version,
          status,
          purchase_readiness,
          budget_amount,
          budget_currency,
          budget_includes_costs,
          budget_approximate,
          location_flexible,
          summary,
          created_by,
          approved_by,
          approved_at
        )
        values ('soleada', $1, 1, 'approved', 'ready_to_buy', 440000, 'EUR', true, true, false, 'Runtime shortlist profile', 'freddy.bremseth@gmail.com', 'freddy.bremseth@gmail.com', now())
        returning id
      `,
      [intakeId],
    );
    const profileId = profile.rows[0].id;
    const shortlist = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_property_shortlists (
          brand,
          buyer_profile_id,
          status,
          title,
          idempotency_key,
          payload_hash,
          correlation_id,
          created_by
        )
        values ('soleada', $1, 'draft', 'Test shortlist', 'shortlist-idempotency-001', $2, 'rf_short_abcdef0123456789abcdef01', 'freddy.bremseth@gmail.com')
        returning id
      `,
      [profileId, `sha256:v1:${"a".repeat(64)}`],
    );
    const shortlistId = shortlist.rows[0].id;
    const item = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_property_shortlist_items (
          shortlist_id,
          brand,
          property_id,
          property_reference,
          property_title,
          property_location,
          rank,
          decision,
          system_eligibility,
          score,
          data_quality_score,
          reasons,
          concerns,
          questions_to_verify,
          selected_by
        )
        values ($1, 'soleada', '22222222-2222-4222-8222-222222222222', 'N8513', 'Moraira apartment', 'Moraira', 1, 'current', 'eligible', 72, 61, '["Location matches."]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'freddy.bremseth@gmail.com')
        returning id
      `,
      [shortlistId],
    );
    assert(item.rows.length === 1, "Runtime role could not insert shortlist item.");

    const crossBrandRows = await queryAsRuntime(
      client,
      "zeneco",
      "select id from public.lead_property_shortlists where id = $1::uuid",
      [shortlistId],
    );
    assert(crossBrandRows.rows.length === 0, "Runtime role leaked cross-brand shortlist.");

    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "delete from public.lead_property_shortlists where id = '00000000-0000-4000-8000-000000000000'",
      "Runtime role could DELETE shortlists.",
      "permission denied",
    );
  });
}

async function testLeadIntelligencePresentationDraft() {
  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await client.query("revoke create on schema public from public");

    process.stdout.write("  Scenario: applies after shortlist schema and is idempotent\n");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);
    await applyMigration(client, migrationFiles.leadIntelligenceShortlistDraft);
    await applyMigration(client, migrationFiles.leadIntelligencePresentationDraft);
    await applyMigration(client, migrationFiles.leadIntelligencePresentationDraft);

    for (const tableName of ["lead_customer_presentations", "lead_customer_message_drafts"]) {
      assert(await tableExists(client, tableName), `public.${tableName} was not created.`);
      const rls = await client.query(
        "select relrowsecurity from pg_class where oid = format('public.%I', $1::text)::regclass",
        [tableName],
      );
      assert(rls.rows[0].relrowsecurity === true, `RLS is not enabled for public.${tableName}.`);
    }

    await assertTableHasColumns(client, "lead_customer_presentations", [
      "id",
      "brand",
      "buyer_profile_id",
      "shortlist_id",
      "status",
      "title",
      "presentation_json",
      "idempotency_key",
      "payload_hash",
      "correlation_id",
      "created_by",
      "created_at",
      "updated_at",
    ]);
    await assertTableHasColumns(client, "lead_customer_message_drafts", [
      "id",
      "brand",
      "presentation_id",
      "buyer_profile_id",
      "shortlist_id",
      "channel",
      "status",
      "subject",
      "body_text",
      "body_html",
      "idempotency_key",
      "payload_hash",
      "correlation_id",
      "created_by",
    ]);

    const grants = await client.query(`
      select
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_presentations', 'select,insert') as presentations_select_insert,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_presentations', 'update') as presentations_update,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_presentations', 'delete') as presentations_delete,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_message_drafts', 'select,insert') as messages_select_insert,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_message_drafts', 'update') as messages_update,
        has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_message_drafts', 'delete') as messages_delete,
        has_table_privilege('anon', 'public.lead_customer_presentations', 'select') as anon_presentations_select,
        has_table_privilege('authenticated', 'public.lead_customer_presentations', 'select') as authenticated_presentations_select,
        has_table_privilege('anon', 'public.lead_customer_message_drafts', 'select') as anon_messages_select,
        has_table_privilege('authenticated', 'public.lead_customer_message_drafts', 'select') as authenticated_messages_select
    `);
    assert(grants.rows[0].presentations_select_insert === true, "Runtime role lacks presentation SELECT/INSERT.");
    assert(grants.rows[0].presentations_update === false, "Runtime role can UPDATE presentations.");
    assert(grants.rows[0].presentations_delete === false, "Runtime role can DELETE presentations.");
    assert(grants.rows[0].messages_select_insert === true, "Runtime role lacks message draft SELECT/INSERT.");
    assert(grants.rows[0].messages_update === false, "Runtime role can UPDATE message drafts.");
    assert(grants.rows[0].messages_delete === false, "Runtime role can DELETE message drafts.");
    assert(grants.rows[0].anon_presentations_select === false, "anon can SELECT presentation drafts.");
    assert(grants.rows[0].authenticated_presentations_select === false, "authenticated can SELECT presentation drafts.");
    assert(grants.rows[0].anon_messages_select === false, "anon can SELECT message drafts.");
    assert(grants.rows[0].authenticated_messages_select === false, "authenticated can SELECT message drafts.");

    const policies = await client.query(`
      select polname, polcmd, array(select rolname from pg_roles where oid = any(polroles)) as roles
      from pg_policy
      where polrelid in (
        'public.lead_customer_presentations'::regclass,
        'public.lead_customer_message_drafts'::regclass
      )
      order by polname
    `);
    assert(policies.rows.length === 4, "Expected four presentation runtime RLS policies.");
    for (const row of policies.rows) {
      assert(
        row.roles.includes("realtyflow_lead_intelligence_runtime"),
        `Policy ${row.polname} is not scoped to runtime role.`,
      );
    }

    process.stdout.write("  Scenario: runtime role can insert/select draft presentation only with matching brand context\n");
    const intake = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_intake_messages (
          brand,
          source,
          status,
          created_by,
          correlation_id,
          idempotency_key
        )
        values ('soleada', 'phone_call', 'draft', 'freddy.bremseth@gmail.com', 'rf_pres_0123456789abcdef0123', 'pres-intake-001')
        returning id
      `,
    );
    const intakeId = intake.rows[0].id;
    const profile = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.buyer_profiles (
          brand,
          intake_id,
          version,
          status,
          purchase_readiness,
          budget_amount,
          budget_currency,
          budget_includes_costs,
          budget_approximate,
          location_flexible,
          summary,
          created_by,
          approved_by,
          approved_at
        )
        values ('soleada', $1, 1, 'approved', 'ready_to_buy', 700000, 'EUR', false, false, true, 'Runtime presentation profile', 'freddy.bremseth@gmail.com', 'freddy.bremseth@gmail.com', now())
        returning id
      `,
      [intakeId],
    );
    const profileId = profile.rows[0].id;
    const shortlist = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_property_shortlists (
          brand,
          buyer_profile_id,
          status,
          title,
          idempotency_key,
          payload_hash,
          correlation_id,
          created_by
        )
        values ('soleada', $1, 'draft', 'Runtime shortlist', 'presentation-shortlist-001', $2, 'rf_pres_abcdef0123456789abcdef01', 'freddy.bremseth@gmail.com')
        returning id
      `,
      [profileId, `sha256:v1:${"b".repeat(64)}`],
    );
    const shortlistId = shortlist.rows[0].id;
    await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_property_shortlist_items (
          shortlist_id,
          brand,
          property_id,
          property_reference,
          property_title,
          property_location,
          rank,
          decision,
          system_eligibility,
          score,
          data_quality_score,
          reasons,
          concerns,
          questions_to_verify,
          selected_by
        )
        values ($1, 'soleada', '33333333-3333-4333-8333-333333333333', 'N8513', 'Moraira villa', 'Moraira', 1, 'current', 'eligible', 82, 70, '["Location matches."]'::jsonb, '["Availability must be verified."]'::jsonb, '[]'::jsonb, 'freddy.bremseth@gmail.com')
      `,
      [shortlistId],
    );
    const presentation = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_customer_presentations (
          brand,
          buyer_profile_id,
          shortlist_id,
          status,
          title,
          presentation_json,
          idempotency_key,
          payload_hash,
          correlation_id,
          created_by
        )
        values ('soleada', $1, $2, 'draft', 'Runtime presentation', '{"version":"lead-customer-presentation-v1"}'::jsonb, 'presentation-idempotency-001', $3, 'rf_pres_fedcba9876543210abcdef01', 'freddy.bremseth@gmail.com')
        returning id
      `,
      [profileId, shortlistId, `sha256:v1:${"c".repeat(64)}`],
    );
    const presentationId = presentation.rows[0].id;
    const message = await queryAsRuntime(
      client,
      "soleada",
      `
        insert into public.lead_customer_message_drafts (
          brand,
          presentation_id,
          buyer_profile_id,
          shortlist_id,
          channel,
          status,
          subject,
          body_text,
          idempotency_key,
          payload_hash,
          correlation_id,
          created_by
        )
        values ('soleada', $1, $2, $3, 'email', 'draft', 'Boligforslag', 'Hei, her er et trygt utkast.', 'message-idempotency-001', $4, 'rf_pres_00112233445566778899aa', 'freddy.bremseth@gmail.com')
        returning id
      `,
      [presentationId, profileId, shortlistId, `sha256:v1:${"d".repeat(64)}`],
    );
    assert(message.rows.length === 1, "Runtime role could not insert message draft.");

    const crossBrandRows = await queryAsRuntime(
      client,
      "zeneco",
      "select id from public.lead_customer_presentations where id = $1::uuid",
      [presentationId],
    );
    assert(crossBrandRows.rows.length === 0, "Runtime role leaked cross-brand presentation draft.");

    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "delete from public.lead_customer_presentations where id = '00000000-0000-4000-8000-000000000000'",
      "Runtime role could DELETE presentations.",
      "permission denied",
    );
    await assertRejectsRuntimeQuery(
      client,
      "soleada",
      "update public.lead_customer_message_drafts set status = 'cancelled'",
      "Runtime role could UPDATE message drafts.",
      "permission denied",
    );
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);

    process.stdout.write("  Scenario: missing shortlist schema fails closed\n");
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligencePresentationDraft, "utf8"),
      "Presentation migration accepted missing shortlist schema.",
      "LEAD_INTELLIGENCE_PRESENTATION_SCHEMA_NOT_READY",
    );
  });

  await withClient(async (client) => {
    await resetPublicSchema(client);
    await ensureSupabaseTestRoles(client);
    await createLeadIntelligenceRuntimeTestObjects(client);
    await client.query("revoke create on schema public from public");
    await applyMigration(client, migrationFiles.leadIntelligencePersistence);
    await applyMigration(client, migrationFiles.leadIntelligenceRuntimeRls);
    await applyMigration(client, migrationFiles.leadIntelligenceShortlistDraft);
    await client.query(`
      create table public.lead_customer_presentations (id uuid primary key default gen_random_uuid());
      comment on table public.lead_customer_presentations is 'legacy unreviewed presentation table';
    `);

    process.stdout.write("  Scenario: incompatible existing presentation table fails closed\n");
    await assertRejectsQuery(
      client,
      await fs.readFile(migrationFiles.leadIntelligencePresentationDraft, "utf8"),
      "Presentation migration accepted incompatible existing table.",
      "LEAD_INTELLIGENCE_PRESENTATION_SCHEMA_INCOMPATIBLE",
    );
  });
}

const tests = new Map([
  ["growth-actions-fingerprint", testGrowthActionsFingerprintIndex],
  ["user-image-bank-contract", testUserImageBankContract],
  ["remaster-job-core", testRemasterJobCore],
  ["lead-intelligence-persistence", testLeadIntelligencePersistenceFoundation],
  ["lead-intelligence-runtime-rls", testLeadIntelligenceRuntimeRls],
  ["lead-intelligence-contact-link-gate", testLeadIntelligenceContactLinkGate],
  ["lead-intelligence-profile-actions", testLeadIntelligenceProfileActions],
  ["lead-intelligence-crm-context", testLeadIntelligenceCrmContextReadonly],
  ["lead-intelligence-shortlist-draft", testLeadIntelligenceShortlistDraft],
  ["lead-intelligence-presentation-draft", testLeadIntelligencePresentationDraft],
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
