import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dashboard = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");
const queue = fs.readFileSync("src/app/(business)/corporate-homes/prospects/page.tsx", "utf8");
const dossier = fs.readFileSync("src/app/(business)/corporate-homes/prospects/[id]/page.tsx", "utf8");

test("Corporate B2B exposes Corporate Account Workspace from all primary entry points", () => {
  assert.match(dashboard, /Åpne konto/);
  assert.match(dashboard, /\/workspace\/zeneco\/corporate\//);
  assert.match(queue, /Åpne konto/);
  assert.match(queue, /\/workspace\/zeneco\/corporate\//);
  assert.match(dossier, /Åpne konto/);
  assert.match(dossier, /\/workspace\/zeneco\/corporate\//);
});
