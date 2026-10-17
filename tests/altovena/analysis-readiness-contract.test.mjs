import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const api=read("src/app/api/altovena/command/analysis/readiness/route.ts");
const migration=read("supabase/migrations/20261017154000_altovena_command_analysis_readiness.sql");
const ui=read("src/app/(realty)/altovena/command/page.tsx");
test("readiness API enforces owner session and only exposes GET",()=>{
 assert.match(api,/requirePlatformOwner\(request\)/);
 assert.match(api,/owner-session/);
 assert.match(api,/Cache-Control.*private, no-store/);
 assert.match(api,/export async function GET/);
 assert.doesNotMatch(api,/export async function (POST|PUT|PATCH|DELETE)/);
 assert.doesNotMatch(api,/\.insert\(|\.update\(|\.delete\(|fetch\(/);
 assert.doesNotMatch(api,/modelCallsAllowed|executeNexus|sendEmail|publish/);
});
test("SQL exposes only one owner-scoped read-only metadata query",()=>{
 assert.match(migration,/SECURITY DEFINER SET search_path=pg_catalog/);
 assert.match(migration,/m\.created_by=v_actor/);
 assert.match(migration,/u\.email_confirmed_at IS NOT NULL/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.altovena_internal_command_analysis_status\(uuid,text\)/);
 assert.match(migration,/TO service_role/);
 assert.doesNotMatch(migration,/INSERT INTO|UPDATE altovena|DELETE FROM altovena|TRUNCATE/);
 assert.match(migration,/false::boolean/);
});
test("UI shows real persisted data without offering a fake reviewer approval",()=>{
 assert.match(ui,/Se analysestatus/);
 assert.match(ui,/api\/altovena\/command\/analysis\/readiness/);
 assert.match(ui,/readinessByMission\[mission\.id\]\?\.source_count/);
 assert.match(ui,/Kontrollørens beslutning/);
 assert.match(ui,/Ingen AI-analyse eller ekstern handling er startet/);
});
