#!/usr/bin/env node

import pg from "pg";

const { Client } = pg;

const connectionString =
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "Missing SUPABASE_DB_URL, POSTGRES_URL, or DATABASE_URL. " +
      "Provide a read-only or protected production connection string to run the Re-Master schema contract.",
  );
  process.exit(2);
}

const strictArchive = process.env.REMASTER_SCHEMA_STRICT_ARCHIVE === "1";
const expectedDbUser = process.env.SCHEMA_CONTRACT_EXPECTED_DB_USER;

const requiredColumns = {
  "public.user_image_bank": [
    "id",
    "owner",
    "url",
    "thumbnail_url",
    "name",
    "kind",
    "tags",
    "size_bytes",
    "width",
    "height",
    "created_at",
    "last_used_at",
    "use_count",
    "archive_status",
    "archive_destination",
    "archived_at",
  ],
  "public.songs": [
    "id",
    "name",
    "artist",
    "genre",
    "mood",
    "bpm",
    "duration",
    "file_url",
    "status",
    "youtube_url",
    "youtube_channel_id",
    "brand",
    "tags",
    "steps",
    "airtable_id",
    "created_at",
    "updated_at",
    "style",
    "energy",
    "visual_style",
    "image_url",
    "ai_metadata",
    "error_message",
    "youtube_video_id",
    "thumbnail_url",
  ],
  "public.genre_images": [
    "id",
    "genre",
    "image_url",
    "created_at",
  ],
  "public.brand_settings": ["id", "brand_id", "settings", "updated_at", "created_at"],
  "public.growth_actions": [
    "id",
    "brand",
    "action_type",
    "platform",
    "content",
    "hypothesis",
    "expected_outcome",
    "priority",
    "status",
    "learnings",
    "executed_at",
    "reviewed_at",
    "created_at",
    "updated_at",
  ],
  "public.social_channels": [
    "id",
    "brand_id",
    "platform",
    "external_id",
    "display_name",
    "metadata",
    "is_active",
    "connected_by_user_id",
    "created_at",
    "updated_at",
  ],
  "public.oauth_tokens": [
    "id",
    "social_channel_id",
    "key_id",
    "access_token_ciphertext",
    "access_token_iv",
    "access_token_tag",
    "refresh_token_ciphertext",
    "refresh_token_iv",
    "refresh_token_tag",
    "expires_at",
    "scopes",
    "token_type",
    "rotated_at",
    "created_at",
    "updated_at",
  ],
  "public.oauth_states": [
    "state_nonce",
    "brand_id",
    "platform",
    "return_to",
    "initiated_by_user_id",
    "metadata",
    "created_at",
    "expires_at",
    "consumed_at",
  ],
  "storage.buckets": ["id", "name", "public"],
  "storage.objects": ["id", "bucket_id", "name", "metadata", "created_at", "updated_at"],
};

const requiredRls = [
  "public.user_image_bank",
  "public.songs",
  "public.genre_images",
  "public.brand_settings",
  "public.growth_actions",
  "public.social_channels",
  "public.oauth_tokens",
  "public.oauth_states",
  "storage.buckets",
  "storage.objects",
];

const requiredIndexes = {
  "public.user_image_bank": [
    "idx_user_image_bank_owner",
    "idx_user_image_bank_kind",
    "idx_user_image_bank_created_at",
  ],
  "public.songs": [
    "idx_songs_brand",
    "idx_songs_created_at",
    "idx_songs_status",
    "idx_songs_youtube_url",
  ],
  "public.social_channels": [
    "idx_social_channels_brand_platform",
    "idx_social_channels_platform_external",
    "idx_social_channels_active",
  ],
  "public.oauth_tokens": ["idx_oauth_tokens_expires_at"],
  "public.oauth_states": ["idx_oauth_states_expires_at", "idx_oauth_states_brand_platform"],
};

const requiredBuckets = ["assets", "neural-beat", "content-images"];

const optionalArchiveColumns = {
  "public.songs": ["archive_status", "archive_destination", "archived_at"],
  "public.plot_assets": ["archive_status", "archive_destination", "archived_at"],
  "public.ad_creatives": ["archive_status", "archive_destination", "archived_at"],
};

const optionalNeuralBeatColumns = {
  "public.genre_images": ["prompt", "usage_count"],
};

const optionalBuckets = ["thumbnails"];
const warnings = [];
const failures = [];

class SchemaContractError extends Error {
  constructor(phase, cause) {
    super(phase);
    this.name = "SchemaContractError";
    this.phase = phase;
    this.code =
      cause && typeof cause === "object" && "code" in cause
        ? String(cause.code)
        : undefined;
  }
}

function splitTableName(qualifiedName) {
  const [schema, table] = qualifiedName.split(".");
  return { schema, table };
}

async function fetchRows(client, query, params = []) {
  const result = await client.query(query, params);
  return result.rows;
}

async function checkExpectedDbUser(client) {
  if (!expectedDbUser) return;

  const rows = await fetchRows(client, "select current_user as current_user");
  if (rows[0]?.current_user !== expectedDbUser) {
    throw new SchemaContractError("identity");
  }
}

async function checkColumns(client, contract, severity = "failure") {
  const qualifiedTables = Object.keys(contract);
  const rows = await fetchRows(
    client,
    `
      select n.nspname as table_schema, c.relname as table_name, a.attname as column_name
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      where (n.nspname || '.' || c.relname) = any($1)
        and c.relkind in ('r', 'p')
        and a.attnum > 0
        and not a.attisdropped
      order by n.nspname, c.relname, a.attnum
    `,
    [qualifiedTables],
  );

  const existing = new Set(
    rows.map((row) => `${row.table_schema}.${row.table_name}.${row.column_name}`),
  );

  for (const [qualifiedTable, columns] of Object.entries(contract)) {
    const { schema, table } = splitTableName(qualifiedTable);
    for (const column of columns) {
      if (!existing.has(`${schema}.${table}.${column}`)) {
        const message = `${qualifiedTable}.${column} is missing`;
        if (severity === "failure") failures.push(message);
        else warnings.push(message);
      }
    }
  }
}

async function checkRls(client) {
  const rows = await fetchRows(
    client,
    `
      select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where (n.nspname || '.' || c.relname) = any($1)
        and c.relkind in ('r', 'p')
    `,
    [requiredRls],
  );

  const found = new Map(
    rows.map((row) => [`${row.schema_name}.${row.table_name}`, Boolean(row.rls_enabled)]),
  );

  for (const qualifiedTable of requiredRls) {
    if (!found.has(qualifiedTable)) {
      failures.push(`${qualifiedTable} table is missing`);
    } else if (!found.get(qualifiedTable)) {
      failures.push(`${qualifiedTable} does not have RLS enabled`);
    }
  }
}

async function checkIndexes(client) {
  const rows = await fetchRows(
    client,
    `
      select n.nspname as schemaname, t.relname as tablename, i.relname as indexname
      from pg_index x
      join pg_class i on i.oid = x.indexrelid
      join pg_class t on t.oid = x.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      where (n.nspname || '.' || t.relname) = any($1)
    `,
    [Object.keys(requiredIndexes)],
  );
  const existing = new Set(
    rows.map((row) => `${row.schemaname}.${row.tablename}.${row.indexname}`),
  );

  for (const [qualifiedTable, indexes] of Object.entries(requiredIndexes)) {
    for (const indexName of indexes) {
      if (!existing.has(`${qualifiedTable}.${indexName}`)) {
        failures.push(`${qualifiedTable} is missing index ${indexName}`);
      }
    }
  }
}

async function checkBuckets(client) {
  const rows = await fetchRows(
    client,
    "select id from storage.buckets where id = any($1)",
    [[...requiredBuckets, ...optionalBuckets]],
  );
  const existing = new Set(rows.map((row) => row.id));

  for (const bucket of requiredBuckets) {
    if (!existing.has(bucket)) failures.push(`storage bucket ${bucket} is missing`);
  }
  for (const bucket of optionalBuckets) {
    if (!existing.has(bucket)) warnings.push(`optional storage bucket ${bucket} is missing`);
  }
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    application_name: "remaster-schema-contract",
  });

  try {
    await client.connect();
  } catch (error) {
    throw new SchemaContractError("connection", error);
  }

  try {
    await client.query("set default_transaction_read_only = on");
    await client.query("set statement_timeout = '30s'");
    await client.query("set lock_timeout = '5s'");
    await client.query("set idle_in_transaction_session_timeout = '30s'");
    await checkExpectedDbUser(client);
    await checkColumns(client, requiredColumns);
    await checkRls(client);
    await checkIndexes(client);
    await checkBuckets(client);
    await checkColumns(client, optionalArchiveColumns, strictArchive ? "failure" : "warning");
    await checkColumns(client, optionalNeuralBeatColumns, "warning");
  } catch (error) {
    if (error instanceof SchemaContractError) throw error;
    throw new SchemaContractError("query", error);
  } finally {
    await client.end().catch(() => undefined);
  }

  console.log("Re-Master schema contract check");
  console.log(`Required failures: ${failures.length}`);
  console.log(`Warnings: ${warnings.length}`);
  for (const warning of warnings) console.log(`WARN ${warning}`);
  for (const failure of failures) console.error(`FAIL ${failure}`);

  if (failures.length > 0) process.exit(1);
}

function reportControlledError(error) {
  if (error instanceof SchemaContractError) {
    if (error.phase === "connection") {
      console.error("Schema contract connection failed.");
    } else if (error.phase === "identity") {
      console.error("Schema contract connected with an unexpected database user.");
    } else if (error.code === "57014") {
      console.error("Schema contract query timed out.");
    } else if (error.code === "55P03") {
      console.error("Schema contract lock timed out.");
    } else {
      console.error("Schema contract query failed.");
    }

    if (error.code) console.error(`Postgres error code: ${error.code}`);
    return;
  }

  console.error("Schema contract failed.");
}

main().catch((error) => {
  reportControlledError(error);
  process.exit(1);
});
