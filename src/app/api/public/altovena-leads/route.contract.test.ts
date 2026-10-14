import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/public/altovena-leads/route.ts","utf8");
const sql = readFileSync("supabase/migrations/20261014210000_altovena_brand_intake.sql","utf8");
const registry = readFileSync("src/lib/marketing/brand-registry.ts","utf8");
const centralBrands=readFileSync("src/lib/constants.ts","utf8");

test("Altovena intake remains off until secret, brand and database are configured", () => {
  for (const item of [
    "ALTOVENA_INTAKE_ENABLED", "ALTOVENA_INTAKE_KEY", "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY", "x-altovena-ingest-key", "matchKey",
    "WRONG_BRAND", "INTAKE_NOT_CONFIGURED",
  ]) assert.ok(route.includes(item),item);
  assert.match(route,/timingSafeEqual/);
  assert.match(route,/request\.headers\.get\("content-type"\)/);
  assert.match(route,/12000/);
  assert.doesNotMatch(route,/process\.env\.ZENECO_API_KEY|resolvePublicLeadBrand|REALTYFLOW_PUBLIC_LEAD_KEY/);
});

test("Altovena API accepts only its own bounded enquiries, not marketing or cross-brand writes", () => {
  for (const item of ["altovena.com/contact","product-enquiry","respond_to_request",
    "marketing", "submissionId", "INVALID_SUBMISSION_ID", "UNKNOWN_FIELDS",
    "p_submission_id","p_product","altovena_receive_lead"]) assert.ok(route.includes(item),item);
  assert.match(route,/\.marketing !== false/);
  assert.match(route,/data\?\.accepted !== true/);
  assert.match(route,/workItemId/);
  assert.doesNotMatch(route,/sendBrandEmail|newsletter|auto.*follow.*up|reply_to/i);
});

test("The DB migration creates an isolated brand and atomic CRM + work-item path", () => {
  assert.match(sql,/insert into core\.brands[\s\S]*'altovena'/i);
  assert.match(sql,/create or replace function public\.altovena_receive_lead\(/i);
  assert.match(sql,/security invoker/i);
  assert.match(sql,/revoke execute on function public\.altovena_receive_lead[\s\S]*from public,anon,authenticated/i);
  assert.match(sql,/grant execute on function public\.altovena_receive_lead[\s\S]*to service_role/i);
  assert.match(sql,/from public\.contacts[\s\S]*brand_id='altovena' and brand='altovena'/i);
  assert.match(sql,/insert into public\.work_items/i);
  assert.match(sql,/'altovena','website_lead'/i);
  assert.match(sql,/insert into public\.altovena_intake_receipts/i);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/notes,interactions,ai_auto_followup,nurture_status,created_at/);
  assert.match(sql,/false,'stopped',v_time/);
  assert.match(sql,/marketing_opt_in',false/);
  assert.match(sql,/Keep any independently-established prior subscription preferences intact/);
  // An anonymous form must never update an existing contact's canonical identity.
  assert.match(sql,/identity_verified',false/);
  assert.match(sql,/Public submissions are NOT identity verification/);
  const contactUpdate = sql.slice(sql.indexOf("update public.contacts"), sql.indexOf("where id=v_contact_id"));
  assert.doesNotMatch(contactUpdate,/set\s+name\s*=|company\s*=/i);


  assert.doesNotMatch(sql,/insert into core\.brand_workspace_memberships/i);
  assert.doesNotMatch(sql,/subscribe|sendmail|notify.*external/i);
});

test("Altovena marketing brand is separate and has no pilot publishing routes enabled", () => {
  assert.match(registry,/\| "altovena"/);
  const segment=registry.slice(registry.indexOf('id: "altovena"'),registry.indexOf('id: "freddyb"'));
  assert.match(segment,/pilotChannels: \[\]/);
  assert.match(segment,/website: "https:\/\/altovena\.com"/);
  assert.match(segment,/RealtyFlow is the sole CRM/);
  assert.doesNotMatch(segment,/pilotChannels: \["instagram"/);
  assert.match(centralBrands, /id: "altovena", name: "Altovena", type: "saas"/);
  assert.match(centralBrands, /"Offer Intelligence".*"Visibility".*"RealtyFlow".*"Olivia OS"/);
});

const scopedTaskRoute=readFileSync("src/app/api/workspaces/[brandKey]/lead-tasks/route.ts","utf8");
const altovenaTaskPanel=readFileSync("src/components/workspaces/altovena-lead-attention.tsx","utf8");
const workspacePage=readFileSync("src/app/(realty)/workspace/[brandKey]/page.tsx","utf8");

test("pending Altovena website tasks remain in the same verified brand workspace",()=>{
  assert.match(scopedTaskRoute,/params\.brandKey !== "altovena"/);
  assert.match(scopedTaskRoute,/requireBrandWorkspace\(request, "altovena", "crm.read"\)/);
  assert.match(scopedTaskRoute,/\.eq\("brand_id", "altovena"\)/);
  assert.match(scopedTaskRoute,/\.eq\("source_type", "website_lead"\)/);
  assert.match(scopedTaskRoute,/\.in\("status", allowedStatuses\)/);
  assert.doesNotMatch(scopedTaskRoute,/\.from\("contacts"\)|\.from\("brand_settings"\)/);
  assert.match(altovenaTaskPanel,/\/api\/workspaces\/altovena\/lead-tasks/);
  assert.match(altovenaTaskPanel,/Dette er varsling i arbeidsflaten/);
  assert.match(workspacePage,/brandKey === "altovena" && permissions\.includes\("crm.read"\)/);
  assert.match(workspacePage,/AltovenaLeadAttention/);
});
