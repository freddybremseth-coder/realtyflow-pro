import assert from "node:assert/strict";
import test from "node:test";
import {issueAltovenaStagingSession,verifyAltovenaStagingSession} from
  "../../src/lib/altovena/staging-session";
import {createAdminSession,verifyAdminSession} from "@/lib/admin-auth";

const ref="abcdefghijklmnopqrst",prod="ereapsfcsqtdmzosgnnn";
const user={userId:"22222222-2222-4222-8222-222222222222",
 email:"operator@example.invalid"};
const now=1800000000000;
function config(changes:Record<string,string|undefined>={}):NodeJS.ProcessEnv{
 return {
  VERCEL_ENV:"preview",NODE_ENV:"production",
  ALTOVENA_STAGING_ISOLATION_ENABLED:"true",
  ALTOVENA_STAGING_SUPABASE_PROJECT_REF:ref,
  ALTOVENA_STAGING_SUPABASE_URL:`https://${ref}.supabase.co`,
  ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY:"stage-role-key-for-synthetic-only",
  ALTOVENA_STAGING_SESSION_SECRET:"separate-isolated-session-signing-secret-64-characters-minimum-2026",
  REALTYFLOW_SESSION_SECRET:"realtyflow-other-platform-signing-key",
  NEXT_PUBLIC_SUPABASE_URL:`https://${prod}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY:"production-like-synthetic-role-key",
  ...changes,
 } as NodeJS.ProcessEnv;
}
test("15-minute staged session is signed for exact preview, project, brand and audience",()=>{
 const env=config();
 const token=issueAltovenaStagingSession(user,now,env);
 assert.ok(token);
 assert.deepEqual(verifyAltovenaStagingSession(token!,now+120000,env),{
  userId:user.userId,email:user.email,
 });
 assert.equal(verifyAltovenaStagingSession(token!,now+900000,env),null);
 assert.equal(verifyAltovenaStagingSession(token!,now-120000,env),null);
 assert.equal(verifyAltovenaStagingSession(token!,now,config({
  ALTOVENA_STAGING_SUPABASE_PROJECT_REF:"bcdefghijklmnopqrstu",
  ALTOVENA_STAGING_SUPABASE_URL:"https://bcdefghijklmnopqrstu.supabase.co",
 })),null);
});
test("staging token cannot be issued or accepted in production, or without isolated DB",()=>{
 const token=issueAltovenaStagingSession(user,now,config());
 for(const change of [
  {VERCEL_ENV:"production"},{VERCEL_ENV:"development"},
  {ALTOVENA_STAGING_ISOLATION_ENABLED:"false"},
  {ALTOVENA_STAGING_SUPABASE_URL:`https://${prod}.supabase.co`},
  {ALTOVENA_STAGING_SESSION_SECRET:undefined},
  {ALTOVENA_STAGING_SESSION_SECRET:"too-short"},
  {ALTOVENA_STAGING_SESSION_SECRET:"realtyflow-other-platform-signing-key"},
  {ALTOVENA_STAGING_SESSION_SECRET:"stage-role-key-for-synthetic-only"},
 ]){
  assert.equal(issueAltovenaStagingSession(user,now,config(change)),null);
  assert.equal(verifyAltovenaStagingSession(token!,now,config(change)),null);
 }
});
test("identity and signature tampering never yields privilege",()=>{
 const env=config();
 assert.equal(issueAltovenaStagingSession({userId:"owner",email:user.email},now,env),null);
 assert.equal(issueAltovenaStagingSession({userId:user.userId,email:"invalid"},now,env),null);
 const token=issueAltovenaStagingSession(user,now,env)!;
 assert.equal(verifyAltovenaStagingSession(token+"A",now,env),null);
 assert.equal(verifyAltovenaStagingSession("not.token",now,env),null);
 const [payload,sig]=token.split(".");
 const forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(payload,"base64url").toString()),
   brand:"zeneco"})).toString("base64url")+"."+sig;
 assert.equal(verifyAltovenaStagingSession(forged,now,env),null);
});
test("staging token does not authenticate as RealtyFlow platform cookie",async()=>{
 const env=config();
 const keys=["REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS"];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try {
  process.env.REALTYFLOW_SESSION_SECRET=env.REALTYFLOW_SESSION_SECRET;
  process.env.REALTYFLOW_ADMIN_EMAILS="owner@example.invalid";
  const token=issueAltovenaStagingSession(user,now,env)!;
  assert.equal(await verifyAdminSession(token),null);
  const platform=await createAdminSession("operator@example.invalid","WORKSPACE_MEMBER");
  assert.equal(verifyAltovenaStagingSession(platform,now,env),null);
 }finally{
  for(const [k,v] of Object.entries(old))
   if(v===undefined)delete process.env[k];else process.env[k]=v;
 }
});
