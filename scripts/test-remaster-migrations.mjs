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

async function resetPublicSchema(client) {
  await client.query("drop schema if exists public cascade");
  await client.query("create schema public");
  await client.query("grant all on schema public to public");
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
      where conrelid = format('public.%I', $1)::regclass
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
      select id, 'duplicate-a', 'https://example.test/a.png', 'image', '{}', now(), 0, 'active' from duplicate
      union all
      select id, 'duplicate-b', 'https://example.test/b.png', 'logo', '{}', now(), 0, 'active' from duplicate
      union all
      select gen_random_uuid(), 'bad-kind', 'https://example.test/bad-kind.png', 'poster', '{}', now(), 0, 'active'
      union all
      select gen_random_uuid(), 'negative-count', 'https://example.test/negative.png', 'thumbnail', '{}', now(), -1, 'active'
      union all
      select null, null, null, null, null, null, null, null
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

const tests = new Map([
  ["growth-actions-fingerprint", testGrowthActionsFingerprintIndex],
  ["user-image-bank-contract", testUserImageBankContract],
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
