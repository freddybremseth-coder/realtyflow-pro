import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const todayPath = fileURLToPath(new URL("../app/(content)/nexus-os/today/page.tsx", import.meta.url));
const samPath = fileURLToPath(new URL("../components/hub/sam-seo-action-board.tsx", import.meta.url));

test("Nexus Today never presents AUTO_READY canary as a manual user task", async () => {
  const page = await readFile(todayPath, "utf8");

  assert.match(page, /Systemet gjør automatisk/);
  assert.match(page, /Du skal ikke kjøre denne manuelt/);
  assert.match(page, /Se autopilotstatus/);
  assert.match(page, /Du må gjøre/);
  assert.match(page, /Følger med/);
  assert.match(page, /De 3 viktigste tingene du skal gjøre nå/);
  assert.doesNotMatch(page, /Kjør \{brandLabel\(marketingCanary\.brandId\)\}/);
  assert.doesNotMatch(page, /href=\{marketingCanary\.path\}/);
});

test("SAM SEO separates explicit owner approvals from system follow-up", async () => {
  const page = await readFile(samPath, "utf8");

  assert.match(page, /humanActions = data\?\.actions\.filter\(action => action\.requiresApproval\)/);
  assert.match(page, /systemFollowups = data\?\.actions\.filter\(action => !action\.requiresApproval\)/);
  assert.match(page, /SEO-oppgaver som faktisk krever deg/);
  assert.match(page, /Ingen SEO-oppgave krever deg nå/);
  assert.match(page, /Sams arbeidsliste/);
  assert.match(page, /Ingen handling fra deg nå/);
  assert.match(page, /KREVER DEG/);
  assert.match(page, /SYSTEMARBEID/);
  assert.doesNotMatch(page, /Dette bør Sam følge opp/);
});


test("Nexus Today filters OS attention by USER SYSTEM and WATCH responsibility", async () => {
  const page = await readFile(todayPath, "utf8");

  assert.match(page, /responsibility\?\? "USER"/);
  assert.match(page, /item\.responsibility === "SYSTEM"/);
  assert.match(page, /item\.responsibility === "WATCH"/);
  assert.match(page, /Ikke oppgaver til deg/);
  assert.match(page, /Systemarbeid og overvåking/);
  assert.match(page, /SYSTEM · \{item\.source\}/);
  assert.match(page, /WATCH · \{item\.source\}/);
});
