import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync(new URL("../../src/app/api/altovena/command/route.ts",import.meta.url),"utf8");
const sql=readFileSync(new URL("../../supabase/migrations/20261016184000_altovena_owner_command_bridge.sql",import.meta.url),"utf8");
test("owner session is checked for every read and write",()=>{
 assert.match(route,/requirePlatformOwner\(request\)/);
 assert.match(route,/source !== "owner-session"/);
 assert.match(route,/export async function GET/);
 assert.match(route,/export async function POST/);
});
test("writes are same-origin and do not accept caller-provided identity",()=>{
 assert.match(route,/origin !== request\.nextUrl\.origin/);
 assert.match(route,/p_actor_email: access\.value!\.context\.email/);
 assert.match(route,/requestId/);
 assert.match(route,/unexpected_parameters/);
 assert.doesNotMatch(route,/body\.actorEmail|body\.tenantId|body\.userId/);
});
test("DB gateway is service-role only and writes draft, not execute",()=>{
 assert.match(sql,/SECURITY DEFINER/g);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.altovena_internal_command_create_draft\(text,text,uuid\) TO service_role/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.altovena_internal_command_create_draft\(text,text,uuid\)/);
 assert.match(sql,/VALUES \(v_tenant,'command',v_actor,btrim\(p_goal\),'draft'\)/);
 assert.match(sql,/mission\.draft_created/);
 assert.doesNotMatch(sql,/EXECUTE\s+AGENT|invoke_agent|send_email|publish_content/i);
});
