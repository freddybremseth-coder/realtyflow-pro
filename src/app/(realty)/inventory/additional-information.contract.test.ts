import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const inventory = fs.readFileSync(path.join(process.cwd(), "src/app/(realty)/inventory/page.tsx"), "utf8");
const propertyApi = fs.readFileSync(path.join(process.cwd(), "src/app/api/properties/route.ts"), "utf8");
const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261024090000_property_additional_information.sql"), "utf8");

test("developer information is a separate optional persisted field", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS additional_information text/);
  assert.match(inventory, /additional_information\?: string/);
  assert.match(inventory, /row\.additional_information/);
  assert.match(inventory, /row\.additional_information = p\.additional_information/);
});

test("inventory supports manual editing and readable display", () => {
  assert.match(inventory, /Mer informasjon fra utbygger/);
  assert.match(inventory, /showEditModal\.additional_information/);
  assert.match(inventory, /showDetailModal\.additional_information/);
  assert.match(inventory, /whitespace-pre-wrap break-words/);
});

test("manual notes are not in public property API projections", () => {
  const projection = propertyApi.match(/const PUBLIC_PROPERTY_SELECT = \[([\s\S]*?)\]\.join\(","\);/)?.[1] || "";
  assert.ok(projection);
  assert.doesNotMatch(projection, /additional_information/);
});
