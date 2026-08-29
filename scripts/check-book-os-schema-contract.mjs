#!/usr/bin/env node

import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
const expectedDbUser = process.env.SCHEMA_CONTRACT_EXPECTED_DB_USER;

if (!connectionString) {
  console.error("Missing a protected database URL for the Book OS schema contract.");
  process.exit(2);
}

const requiredColumns = {
  book_series: ["id", "slug", "title", "category"],
  book_titles: [
    "id", "slug", "series_id", "series_number", "language", "cover_image_url",
    "sample_pdf_path", "amazon_url", "ebook_file_path", "status",
  ],
  publishing_book_projects: [
    "id", "title", "language", "status", "metadata_plan", "outline_plan",
    "chapter_drafts", "series_name", "source_book_id", "parent_project_id",
  ],
  publishing_books: [
    "id", "title", "asin", "series_name", "keywords", "main_category",
    "source_project_id", "epub_path", "orders", "royalties",
  ],
  book_growth_recommendations: [
    "id", "book_id", "series_id", "recommendation_type", "status", "approved_at", "applied_at",
  ],
  book_growth_events: ["id", "book_id", "series_id", "event_type", "occurred_at"],
  book_growth_metrics: ["id", "book_id", "channel", "metric_date", "orders", "royalties", "ad_spend"],
  book_growth_experiments: ["id", "book_id", "dimension", "status", "result", "recommendation_id"],
  book_growth_learning_rules: ["id", "scope", "dimension", "verdict", "evidence"],
  book_growth_channel_metadata: ["id", "book_id", "channel", "external_id", "metadata"],
  book_growth_search_terms: ["id", "book_id", "channel", "search_term", "orders", "sales"],
  book_growth_apply_log: ["id", "recommendation_id", "book_id", "applied_by", "created_at"],
  book_growth_works: ["id", "series_id", "work_key", "canonical_title", "status"],
  book_growth_work_members: ["id", "work_id", "book_id", "relation_type"],
  book_growth_asin_candidates: ["id", "book_id", "candidate_asin", "status"],
  book_growth_work_merge_candidates: ["id", "source_work_id", "target_work_id", "status"],
  book_growth_work_merge_log: ["id", "source_work_id", "target_work_id", "moved_book_ids"],
  book_growth_edition_language_candidates: ["id", "book_id", "current_language", "proposed_language", "status"],
  book_growth_edition_language_apply_log: ["id", "candidate_id", "book_id", "resulting_language"],
  book_growth_channel_metadata_candidates: ["id", "book_id", "channel", "status", "proposed_title"],
  book_growth_channel_metadata_apply_log: ["id", "candidate_id", "book_id", "applied_by"],
  work_items: ["id", "status", "source_type", "source_id", "metadata", "created_at", "updated_at"],
  publishing_work_bibles: ["id", "work_id", "bible_type", "version", "status", "content", "approved_by", "approved_at"],
  publishing_revision_quality_checks: ["id", "revision_id", "check_type", "result", "decision", "evidence", "decided_by"],
  publishing_taxonomy_terms: ["id", "scheme", "channel", "code", "label", "source_version"],
  publishing_edition_taxonomy_assignments: ["id", "edition_id", "revision_id", "scheme", "channel", "code", "status", "approved_by"],
};

const serverOnlyTables = [
  "book_ad_search_terms",
  "book_channel_metadata",
  "book_growth_apply_log",
  "book_growth_asin_candidates",
  "book_growth_channel_metadata",
  "book_growth_channel_metadata_apply_log",
  "book_growth_channel_metadata_candidates",
  "book_growth_edition_language_apply_log",
  "book_growth_edition_language_candidates",
  "book_growth_events",
  "book_growth_experiments",
  "book_growth_learning_rules",
  "book_growth_metrics",
  "book_growth_recommendations",
  "book_growth_search_terms",
  "book_growth_work_members",
  "book_growth_work_merge_candidates",
  "book_growth_work_merge_log",
  "book_growth_works",
  "publishing_work_bibles",
  "publishing_revision_quality_checks",
  "publishing_taxonomy_terms",
  "publishing_edition_taxonomy_assignments",
];

const failures = [];

async function checkIdentity(client) {
  if (!expectedDbUser) return;
  const { rows } = await client.query("select current_user");
  if (rows[0]?.current_user !== expectedDbUser) failures.push("connected with an unexpected database user");
}

async function checkColumns(client) {
  const tables = Object.keys(requiredColumns);
  const { rows } = await client.query(
    `select table_name, column_name
       from information_schema.columns
      where table_schema='public' and table_name = any($1)`,
    [tables],
  );
  const found = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  for (const [table, columns] of Object.entries(requiredColumns)) {
    for (const column of columns) {
      if (!found.has(`${table}.${column}`)) failures.push(`public.${table}.${column} is missing`);
    }
  }
}

async function checkServerOnlyTables(client) {
  const { rows } = await client.query(
    `select
       c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_access,
       has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_access,
       has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as service_access,
       exists (
         select 1 from pg_policies p
          where p.schemaname='public'
            and p.tablename=c.relname
            and p.policyname='Deny direct API access to Book OS data'
       ) as deny_policy
     from pg_class c
     join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind in ('r','p') and c.relname = any($1)`,
    [serverOnlyTables],
  );
  const found = new Map(rows.map((row) => [row.table_name, row]));
  for (const table of serverOnlyTables) {
    const row = found.get(table);
    if (!row) {
      failures.push(`public.${table} is missing`);
      continue;
    }
    if (!row.rls_enabled) failures.push(`public.${table} does not have RLS enabled`);
    if (row.anon_access) failures.push(`anon retains direct access to public.${table}`);
    if (row.authenticated_access) failures.push(`authenticated retains direct access to public.${table}`);
    if (!row.service_access) failures.push(`service_role cannot manage public.${table}`);
    if (!row.deny_policy) failures.push(`public.${table} is missing its explicit deny policy`);
  }
}

async function checkMutationFunction(client) {
  const { rows } = await client.query(`
    select
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
      p.prosecdef as security_definer,
      coalesce(array_to_string(p.proconfig, ','), '') as configuration
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.oid='public.book_growth_apply_channel_metadata_candidate(uuid,text)'::regprocedure
  `);
  const row = rows[0];
  if (!row) {
    failures.push("book_growth_apply_channel_metadata_candidate(uuid,text) is missing");
    return;
  }
  if (row.anon_execute || row.authenticated_execute) failures.push("Book Growth mutation RPC is publicly executable");
  if (!row.service_execute) failures.push("service_role cannot execute the Book Growth mutation RPC");
  if (!row.security_definer) failures.push("Book Growth mutation RPC lost its atomic privileged execution contract");
  if (!row.configuration.includes("search_path=\"\"")) failures.push("Book Growth mutation RPC search_path is not empty");
}

async function checkGrowthActionIdentity(client) {
  const { rows: indexRows } = await client.query(`
    select i.indisunique
    from pg_class idx
    join pg_index i on i.indexrelid=idx.oid
    join pg_class tbl on tbl.oid=i.indrelid
    join pg_namespace n on n.oid=tbl.relnamespace
    where n.nspname='public'
      and tbl.relname='work_items'
      and idx.relname='work_items_book_growth_open_action_unique'
  `);
  if (indexRows.length !== 1 || !indexRows[0].indisunique) failures.push("canonical open growth-action unique index is missing");

  const { rows: duplicateRows } = await client.query(`
    select count(*)::int as duplicate_groups
    from (
      select metadata->>'book_id', metadata->>'action_type'
      from public.work_items
      where source_type='kdp'
        and status in ('TO_DO','IN_PROGRESS','REVIEW')
        and metadata->>'loop'='publishing_growth_v1'
      group by 1,2
      having count(*) > 1
    ) duplicates
  `);
  if (duplicateRows[0]?.duplicate_groups !== 0) failures.push("duplicate open Book Growth actions still exist");
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    application_name: "book-os-schema-contract",
  });
  await client.connect();
  try {
    await client.query("set default_transaction_read_only = on");
    await client.query("set statement_timeout = '30s'");
    await client.query("set lock_timeout = '5s'");
    await checkIdentity(client);
    await checkColumns(client);
    await checkServerOnlyTables(client);
    await checkMutationFunction(client);
    await checkGrowthActionIdentity(client);
  } finally {
    await client.end().catch(() => undefined);
  }

  console.log("Book OS schema contract check");
  console.log(`Failures: ${failures.length}`);
  for (const failure of failures) console.error(`FAIL ${failure}`);
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
  console.error(`Book OS schema contract failed (${code}).`);
  process.exit(1);
});
