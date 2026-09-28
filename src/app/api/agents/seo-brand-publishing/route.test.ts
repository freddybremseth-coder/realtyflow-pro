import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { POST } from "./route";
const endpoint="https://realtyflow.test/api/agents/seo-brand-publishing";
function req(cookie?:string,body:unknown={action:"rollback",brandId:"freddyb",revision:"a".repeat(40)},headers:Record<string,string>={}) {
  return new NextRequest(endpoint,{method:"POST",headers:{"Content-Type":"application/json",...(cookie?{cookie}:{}),...headers},body:JSON.stringify(body)});
}
test.beforeEach(()=>{
  process.env.REALTYFLOW_SESSION_SECRET="seo-brand-route-test";
  process.env.REALTYFLOW_ADMIN_EMAILS="owner@example.test";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});
test("rollback requires owner session before database or GitHub access",async()=>{
  assert.equal((await POST(req())).status,403);
  const session=await createAdminSession("staff@example.test","SALES");
  assert.equal((await POST(req("realtyflow_admin="+session))).status,403);
});
test("owner rollback rejects foreign origin, cross-site requests and invalid brand/revision",async()=>{
  const cookie="realtyflow_admin="+await createAdminSession("owner@example.test");
  assert.equal((await POST(req(cookie,undefined,{origin:"https://evil.test"}))).status,403);
  assert.equal((await POST(req(cookie,undefined,{"sec-fetch-site":"cross-site"}))).status,403);
  assert.equal((await POST(req(cookie,undefined,{"Content-Type":"text/plain"}))).status,403);
  for(const body of [null,{action:"apply",brandId:"freddyb",revision:"a".repeat(40)},
    {action:"rollback",brandId:"zenecocare",revision:"a".repeat(40)},
    {action:"rollback",brandId:"freddyb",revision:"main"}])
    assert.equal((await POST(req(cookie,body))).status,400);
  assert.equal((await POST(req(cookie))).status,503);
});
