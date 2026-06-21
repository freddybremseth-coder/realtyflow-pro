import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

const clientPath = path.join(
  process.cwd(),
  "src/components/lead-intelligence/lead-intelligence-client.tsx",
);

test("Lead Intelligence preview exposes only local review actions", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("Kopier JSON"), true);
  assert.equal(source.includes("Start på nytt"), true);
  assert.equal(source.includes("Analyser på nytt"), true);
  assert.equal(source.includes("Lagre intake og kjøperprofil"), true);
  assert.equal(source.includes("Vis kontaktkandidater"), true);
  assert.equal(source.includes("Opprett lead"), false);
  assert.equal(source.includes("Send til kunde"), false);
  assert.equal(source.includes("Finn boliger"), false);
  assert.equal(source.includes("E-post sendt: nei"), true);
  assert.equal(source.includes("Property matching: nei"), true);
});

test("Lead Intelligence preview does not call CRM, lead, email, property, or Supabase endpoints directly", async () => {
  const source = await readFile(clientPath, "utf8");
  const forbidden = [
    "/api/contacts",
    "/api/leads",
    "/api/email",
    "/api/properties",
    "/api/neural-beat",
    "supabase",
  ];

  for (const needle of forbidden) {
    assert.equal(source.includes(needle), false, `${needle} should not appear in preview UI`);
  }

  assert.equal(source.includes("/api/lead-intelligence/analyze"), true);
  assert.equal(source.includes("/api/lead-intelligence/contact-candidates"), true);
  assert.equal(source.includes("/api/lead-intelligence/review"), true);
});

test("Lead Intelligence preview clears stale candidates before review save", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("const clearContactCandidates = () =>"), true);
  assert.equal(source.includes("setContactCandidatesLoaded(false);"), true);
  assert.equal(source.includes("setContactCandidates([]);"), true);
  assert.equal(source.includes("setSelectedContactId(null);"), true);
  assert.equal(source.includes("          contactCandidates,\n          reviewedCriteria"), false);
});

test("Lead Intelligence preview distinguishes not-loaded and empty contact candidate lookup", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("Ingen kontaktkandidater hentet ennå."), true);
  assert.equal(
    source.includes("Kandidatoppslag fullført. Ingen matchende kontaktkandidater funnet."),
    true,
  );
  assert.equal(source.includes("kontaktkandidat{contactCandidates.length === 1"), true);
});

test("Lead Intelligence preview does not expose contact lookup hashes", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("matchValueHash"), false);
});

test("Lead Intelligence preview sends stable criterion fingerprints instead of array indexes", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("criterionReviewFingerprint"), true);
  assert.equal(source.includes("fingerprint: criterion.fingerprint"), true);
  assert.equal(source.includes("index: criterion.index"), false);
});

test("Lead Intelligence preview surfaces idempotent duplicate saves clearly", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("idempotencySeed: response.correlationId"), true);
  assert.equal(source.includes("Identisk review var allerede lagret."), true);
  assert.equal(source.includes("Ny lagring:"), true);
  assert.equal(source.includes("Duplicate:"), true);
  assert.equal(source.includes("Conflict:"), true);
});

test("Lead Intelligence preview clears stale save results when reviewed payload changes", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("const clearContactCandidates = () =>"), true);
  assert.equal(source.includes("setSaveError(null);"), true);
  assert.equal(source.includes("setSaveResult(null);"), true);
  assert.equal(source.includes("const updateCriterionReview = "), true);
  assert.equal(source.includes("setSource(event.target.value as Source);"), true);
  assert.equal(source.includes("setLanguage(value);"), true);
  assert.equal(source.includes("setContactDecision(\"connect_existing\");"), true);
});

test("Lead Intelligence preview surfaces safe review diagnostics", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("saveError.details"), true);
  assert.equal(source.includes("prettyJson(saveError.details)"), true);
});

test("Lead Intelligence preview explains duplicate and conflict review saves", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("saveError.code === \"REVIEW_CONFLICT\""), true);
  assert.equal(source.includes("Systemet har ikke"), true);
  assert.equal(source.includes("overskrevet buyer profile eller kriterier"), true);
  assert.equal(source.includes("Ingen nye rader ble opprettet."), true);
  assert.equal(source.includes("samme intake, analyse og buyer profile"), true);
});
