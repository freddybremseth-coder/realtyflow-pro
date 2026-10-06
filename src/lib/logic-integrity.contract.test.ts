import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function source(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

const newsletter = source("src/app/api/email/newsletter/route.ts");
const contentStudio = source("src/app/(content)/content-studio/page.tsx");
const inventory = source("src/app/(realty)/inventory/page.tsx");
const workspaceProperties = source("src/app/api/workspaces/[brandKey]/properties/route.ts");

test("newsletter delivery is brand-local and suppression-safe on the server", () => {
  assert.match(newsletter, /\.eq\("brand_id", brand_id\)/);
  assert.match(newsletter, /\.eq\("do_not_contact", false\)/);
  assert.match(newsletter, /\.eq\("email_suppressed", false\)/);
  assert.doesNotMatch(newsletter, /brand_filter/);
  assert.match(newsletter, /requestedIndividuals/);
});

test("Content Studio uses the same brand boundary and property reference identity", () => {
  assert.match(contentStudio, /contactBrand === nlBrand/);
  assert.match(contentStudio, /!contact\.do_not_contact/);
  assert.match(contentStudio, /!contact\.email_suppressed/);
  assert.doesNotMatch(contentStudio, /nlRecipientMode === "brand"/);
  assert.match(contentStudio, /p\.ref\?\.toLowerCase\(\)\.includes\(q\)/);
  assert.match(contentStudio, /prop\.primary_image \|\| prop\.image_url/);
});

test("Inventory never substitutes believable demo listings for live data", () => {
  assert.doesNotMatch(inventory, /INITIAL_PROPERTIES/);
  assert.match(inventory, /useState<Property\[\]>\(\[\]\)/);
  assert.match(inventory, /setProperties\(\[\]\)/);
  assert.match(inventory, /Ingen demo- eller eksempelboliger vises som erstatning/);
});

test("CSV import preserves the unique human property reference", () => {
  assert.match(inventory, /const refIdx = findCol/);
  assert.match(inventory, /ref: ref \|\| undefined/);
  assert.match(inventory, /id: ref \? `CSV-\$\{ref\}`/);
});

test("workspace catalogue search stays injection-safe and pagination uses look-ahead", () => {
  assert.match(workspaceProperties, /\\p\{L\}\\p\{N\}\\s-/);
  assert.doesNotMatch(workspaceProperties, /\\s\._/);
  assert.match(workspaceProperties, /\.range\(\(page - 1\) \* perPage, page \* perPage\)/);
  assert.match(workspaceProperties, /const hasMore = safeRows\.length > perPage/);
  assert.match(workspaceProperties, /safeRows\.slice\(0, perPage\)/);
});