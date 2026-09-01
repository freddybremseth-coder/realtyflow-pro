import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/publishing/book-engine/learning-intake/route.ts"), "utf8");
const links = fs.readFileSync(path.join(process.cwd(), "src/components/book-growth/approved-next-book-intake-links.tsx"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(business)/publishing/forfatterstudio/learning-intake/page.tsx"), "utf8");
const [getSection, postSection = ""] = route.split("export async function POST");

test("learning intake GET is admin-only, read-only and requires separate create and production-start actions", () => {
  assert.match(getSection, /requireAdminApi\(request\)/);
  assert.match(getSection, /proposal\.proposal_type !== "next_book"/);
  assert.match(getSection, /proposal\.status !== "approved"/);
  assert.match(getSection, /requiresExplicitCreate:\s*true/);
  assert.match(getSection, /requiresExplicitProductionStart:\s*true/);
  assert.doesNotMatch(getSection, /\.insert\(/);
  assert.doesNotMatch(getSection, /\.upsert\(/);
  assert.doesNotMatch(getSection, /\.update\(/);
  assert.doesNotMatch(getSection, /\.delete\(/);
  assert.doesNotMatch(getSection, /\.rpc\(/);
});

test("create_draft revalidates approval, prevents duplicate origin and keeps production pending", () => {
  assert.match(postSection, /action !== "create_draft"/);
  assert.match(postSection, /loadApprovedNextBookProposal\(sb, proposalId\)/);
  assert.match(postSection, /book_os_origin/);
  assert.match(postSection, /learning_proposal_id:\s*proposal\.id/);
  assert.match(postSection, /\.contains\("metadata_plan", \{ book_os_origin: \{ learning_proposal_id: proposalId \} \}\)/);
  assert.match(postSection, /\.from\("publishing_book_projects"\)\.insert\(/);
  assert.match(postSection, /status:\s*"draft"/);
  assert.match(postSection, /status:\s*"pending"/);
  assert.match(postSection, /production_start_approved:\s*false/);
  assert.match(postSection, /production_started:\s*false/);
  assert.match(postSection, /queued:\s*false/);
  assert.doesNotMatch(postSection, /\.rpc\(/);
});

test("start_production requires matching provenance and approves only a clean pending draft", () => {
  assert.match(postSection, /action === "start_production"/);
  assert.match(postSection, /origin\.source !== "approved_learning_proposal"/);
  assert.match(postSection, /origin\.learning_proposal_id/);
  assert.match(postSection, /production_progress\?\.status \|\| ""\) !== "pending"/);
  assert.match(postSection, /String\(project\.status \|\| ""\) !== "draft"/);
  assert.match(postSection, /Pending learning draft already contains production output/);
  assert.match(postSection, /production_start_approved_at:\s*now/);
  assert.match(postSection, /production_start_authority:\s*"explicit_admin_action"/);
  assert.match(postSection, /generation_state:\s*"production_start_approved"/);
  assert.match(postSection, /status:\s*"approved"/);
  assert.match(postSection, /production_start_approved:\s*true/);
  assert.match(postSection, /production_started:\s*false/);
  assert.match(postSection, /requires_explicit_generation:\s*true/);
});

test("Learning Center exposes intake only for approved next-book proposals", () => {
  assert.match(links, /row\.proposal_type === "next_book"/);
  assert.match(links, /row\.status === "approved"/);
  assert.match(links, /Open controlled Book Engine intake/);
  assert.doesNotMatch(links, /method:\s*"POST"/);
});

test("controlled production UI keeps draft creation separate and runs canon before author generation", () => {
  assert.match(page, /Create Book Engine draft/);
  assert.match(page, /Start controlled production/);
  assert.match(page, /async function createDraftProject/);
  assert.match(page, /async function startControlledProduction/);
  assert.match(page, /action:\s*"create_draft"/);
  assert.match(page, /action:\s*"start_production"/);
  assert.match(page, /body\.production_started !== false \|\| body\.production_start_approved !== false/);
  assert.match(page, /approved\.production_start_approved !== true \|\| approved\.production_started !== false/);
  assert.match(page, /mode:\s*"generate_seo"/);
  assert.match(page, /mode:\s*"generate_author"/);
  assert.ok(page.indexOf('action: "start_production"') < page.indexOf('mode: "generate_seo"'));
  assert.ok(page.indexOf('mode: "generate_seo"') < page.indexOf('mode: "generate_author"'));
  assert.match(page, /if \(!seoRes\.ok\) throw/);
  assert.match(page, /if \(!authorRes\.ok\) throw/);
  assert.match(page, /productionStarted \? .*Open started project in Forfatterstudio/s);
});
