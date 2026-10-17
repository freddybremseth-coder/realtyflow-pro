import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source=path=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const card=source("src/components/workspaces/altovena-lead-attention.tsx");
const workspace=source("src/app/(realty)/workspace/[brandKey]/page.tsx");
const route=source("src/app/api/workspaces/[brandKey]/lead-contact/route.ts");

test("task-specific button passes its scoped contactId, rather than only opening generic CRM",()=>{
 assert.match(card,/onOpenLeads\(task\.contactId \|\| undefined\)/);
 assert.match(card,/Åpne kundekort/);
 assert.match(workspace,/openAltovenaLeadContact\(contactId\)/);
 assert.match(workspace,/contactId=\$\{encodeURIComponent\(contactId\)\}/);
});
test("page refuses unauthenticated or cross-brand lookup replies and selects exact CRM card",()=>{
 assert.match(workspace,/body\?\.brand !== "altovena"/);
 assert.match(workspace,/body\?\.contact\?\.id !== contactId/);
 assert.match(workspace,/setFocusedAltovenaContact\(body\.contact as Contact\)/);
 assert.match(workspace,/setSelectedCustomerId\(contactId\)/);
 assert.match(workspace,/focusedAltovenaError/);
 assert.match(workspace,/if \(brandKey !== "altovena"\) return/);
 assert.match(workspace,/altovenaLookupVersion\.current \+= 1/);
 assert.match(workspace,/focusedAltovenaContactId\.current = ""/);
});
test("lookup route is hard-coded to Altovena, crm.read, and branded contact rows",()=>{
 assert.match(route,/requireBrandWorkspace\(request,"altovena","crm\.read"\)/);
 assert.match(route,/\.eq\("brand_id","altovena"\)\.eq\("brand","altovena"\)\.eq\("id",id\)/);
 assert.match(route,/cache-control/i);
 assert.doesNotMatch(route,/\.select\("\*"\)/);
 assert.doesNotMatch(route,/commission_amount|interactions/);
});
