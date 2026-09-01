import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/publishing/book-engine/learning-intake/route.ts"), "utf8");
const links = fs.readFileSync(path.join(process.cwd(), "src/components/book-growth/approved-next-book-intake-links.tsx"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(business)/publishing/forfatterstudio/learning-intake/page.tsx"), "utf8");

test("learning intake resolver is admin-only, read-only and approved next-book only", () => {
  assert.match(route, /requireAdminApi\(request\)/);
  assert.match(route, /proposal\.proposal_type !== "next_book"/);
  assert.match(route, /proposal\.status !== "approved"/);
  assert.match(route, /requiresExplicitCreate:\s*true/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.delete\(/);
  assert.doesNotMatch(route, /\.rpc\(/);
});

test("Learning Center exposes intake only for approved next-book proposals", () => {
  assert.match(links, /row\.proposal_type === "next_book"/);
  assert.match(links, /row\.status === "approved"/);
  assert.match(links, /Open controlled Book Engine intake/);
  assert.doesNotMatch(links, /method:\s*"POST"/);
});

test("Book Engine intake requires explicit draft creation and stops before production", () => {
  assert.match(page, /Create Book Engine draft/);
  assert.match(page, /async function createDraftProject/);
  assert.match(page, /fetch\("\/api\/publishing\/book-engine"/);
  assert.match(page, /method:\s*"POST"/);
  assert.doesNotMatch(page, /generate_seo/);
  assert.doesNotMatch(page, /generate_author/);
  assert.doesNotMatch(page, /production-handoff/);
  assert.doesNotMatch(page, /distribution/);
  assert.match(page, /\/publishing\/forfatterstudio\?project=/);
});
