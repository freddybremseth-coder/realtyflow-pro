import assert from "node:assert/strict";
import test from "node:test";
import { getAltovenaStagingChecklist } from
  "../../src/lib/altovena/staging-readiness";

const stage="abcdefghijklmnopqrst";
const production="ereapsfcsqtdmzosgnnn";
const config={
  VERCEL_ENV:"preview",
  NODE_ENV:"production",
  ALTOVENA_STAGING_ISOLATION_ENABLED:"true",
  ALTOVENA_STAGING_SUPABASE_PROJECT_REF:stage,
  ALTOVENA_STAGING_SUPABASE_URL:`https://${stage}.supabase.co`,
  ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY:"synthetic-server-key-never-real",
  NEXT_PUBLIC_SUPABASE_URL:`https://${production}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY:"synthetic-platform-key-never-real",
};
const check=(output:ReturnType<typeof getAltovenaStagingChecklist>,id:string)=>
  output.checks.find(row=>row.id===id);

test("missing staging project explains cost gate before any writes",()=>{
  const result=getAltovenaStagingChecklist({
    ...config,
    ALTOVENA_STAGING_ISOLATION_ENABLED:undefined,
    ALTOVENA_STAGING_SUPABASE_PROJECT_REF:undefined,
    ALTOVENA_STAGING_SUPABASE_URL:undefined,
    ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY:undefined,
  });
  assert.equal(result.stagingReadyForHumanTest,false);
  assert.equal(check(result,"staging_database")?.state,"not_configured");
  assert.match(result.nextAction,/kostnadsgodkjenning/i);
  assert.equal(result.checks.every(x=>x.state!=="verified"),true);
});
test("production project cannot be mistaken for isolated staging",()=>{
  const result=getAltovenaStagingChecklist({
    ...config,ALTOVENA_STAGING_SUPABASE_PROJECT_REF:production,
    ALTOVENA_STAGING_SUPABASE_URL:`https://${production}.supabase.co`,
  });
  assert.equal(check(result,"staging_database")?.state,"blocked");
  assert.match(result.nextAction,/Produksjonsprosjektet er ikke tillatt/);
});
test("mismatched staging URL is blocked; no secret or host appears in response",()=>{
  const result=getAltovenaStagingChecklist({
    ...config,ALTOVENA_STAGING_SUPABASE_URL:`https://${production}.supabase.co`,
  });
  assert.equal(check(result,"staging_endpoint")?.state,"blocked");
  const text=JSON.stringify(result);
  assert.equal(text.includes(production),false);
  assert.equal(text.includes(config.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY),false);
  assert.equal(text.includes(config.SUPABASE_SERVICE_ROLE_KEY),false);
});
test("configured URL NEVER marks real users, public release or SMTP as verified",()=>{
  const result=getAltovenaStagingChecklist(config);
  assert.equal(check(result,"staging_endpoint")?.state,"verified");
  assert.equal(check(result,"staging_opt_in")?.state,"verified");
  assert.equal(check(result,"staging_auth")?.state,"needs_external_verification");
  assert.equal(check(result,"staging_e2e")?.state,"needs_external_verification");
  assert.equal(check(result,"smtp")?.state,"needs_external_verification");
  assert.equal(result.stagingReadyForHumanTest,false);
  assert.match(result.nextAction,/URL-kontrollen alene godkjenner ikke oppstart/);
});
test("partial secret or opt-in configuration stays safely incomplete",()=>{
  let result=getAltovenaStagingChecklist({
    ...config,ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY:undefined,
  });
  assert.equal(check(result,"staging_secret")?.state,"not_configured");
  assert.equal(result.stagingReadyForHumanTest,false);
  result=getAltovenaStagingChecklist({
    ...config,ALTOVENA_STAGING_ISOLATION_ENABLED:undefined,
  });
  assert.equal(check(result,"staging_opt_in")?.state,"not_configured");
  assert.equal(result.stagingReadyForHumanTest,false);
});
