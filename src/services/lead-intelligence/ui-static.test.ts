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
  assert.equal(source.includes("Opprett lead"), false);
  assert.equal(source.includes("Send til kunde"), false);
  assert.equal(source.includes("Finn boliger"), false);
});

test("Lead Intelligence preview does not call CRM, lead, email, or database endpoints", async () => {
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
});
