import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260901124500_book_os_publication_assets_bucket.sql", "utf8");

test("publication assets bucket stays private and size bounded", () => {
  assert.match(migration, /'publishing-assets'/);
  assert.match(migration, /false,\s*104857600,/s);
  assert.match(migration, /application\/epub\+zip/);
  assert.match(migration, /application\/pdf/);
  assert.match(migration, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
  assert.match(migration, /application\/zip/);
});

test("publication assets migration never changes global storage object privileges", () => {
  assert.doesNotMatch(migration, /\b(?:grant|revoke)\b[^;]*\bon\s+(?:table\s+)?storage\.objects\b/i);
});

test("publication assets migration is idempotent and keeps bucket private on conflict", () => {
  assert.match(migration, /on conflict \(id\) do update set/i);
  assert.match(migration, /public\s*=\s*false/i);
  assert.match(migration, /file_size_limit\s*=\s*excluded\.file_size_limit/i);
  assert.match(migration, /allowed_mime_types\s*=\s*excluded\.allowed_mime_types/i);
});
