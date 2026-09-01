import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/publishing/book-engine/learning-intake/route.ts"), "utf8");
const links = fs.readFileSync(path.join(process.cwd(), "src/components/book-growth/approved-next-book-intake-links.tsx"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(business)/publishing/forfatterstudio/learning-intake/page.tsx"), "utf8");
const [getSection, postSection = ""] = route.split("export async function POST");

test("learning intake GET is admin-only, read-only and approved next-book only", () => {
  assert.match(getSection, /requireAdminApi\(request\)/);
  assert.match(getSection, /proposal\.proposal_type !== "next_book"/);
  assert.match(getSection, /proposal\.status !== "approved"/);
  assert.match(getSection, /requiresExplicitCreate:\s*true/);
  assert.doesNotMatch(getSection, /\.insert\(/);
  assert.doesNotMatch(getSection, /\.upsert\(/);
  assert.doesNotMatch(getSection, /\.update\(/);
  assert.doesNotMatch(getSection, /\.delete\(/);
  assert.doesNotMatch(getSection, /\.rpc\(/);
});

test("explicit POST revalidates approval, prevents duplicate origin and creates only a draft project", () => {
  assert.match(postSection, /loadApprovedNextBookProposal\(sb, proposalId\)/);
  assert.match(postSection, /book_os_origin/);
  assert.match(postSection, /learning_proposal_id:\s*proposal\.id/);
  assert.match(postSection, /\.contains\("metadata_plan", \{ book_os_origin: \{ learning_proposal_id: proposalId \} \}\)/);
  assert.match(postSection, /\.from\("publishing_book_projects"\)\.insert\(/);
  assert.match(postSection, /status:\s*"draft"/);
  assert.match(postSection, /status:\s*"pending"/);
  assert.match(postSection, /production_started:\s*false/);
  assert.match(postSection, /queued:\s*false/);
  assert.doesNotMatch(postSection, /generate_seo/);
  assert.doesNotMatch(postSection, /generate_author/);
  assert.doesNotMatch(postSection, /\.rpc\(/);
});

test("Learning Center exposes intake only for approved next-book proposals", () => {
  assert.match(links, /row\.proposal_type === "next_book"/);
  assert.match(links, /row\.status === "approved"/);
  assert.match(links, /Open controlled Book Engine intake/);
  assert.doesNotMatch(links, /method:\s*"POST"/);
});

test("Book Engine intake uses controlled origin endpoint and stops before production", () => {
  assert.match(page, /Create Book Engine draft/);
  assert.match(page, /async function createDraftProject/);
  assert.match(page, /fetch\("\/api\/publishing\/book-engine\/learning-intake"/);
  assert.match(page, /proposalId,/);
  assert.match(page, /body\.production_started !== false/);
  assert.doesNotMatch(page, /fetch\("\/api\/publishing\/book-engine",/);
  assert.doesNotMatch(page, /mode:\s*"generate_seo"/);
  assert.doesNotMatch(page, /mode:\s*"generate_author"/);
  assert.match(page, /\/publishing\/forfatterstudio\?project=/);
});
