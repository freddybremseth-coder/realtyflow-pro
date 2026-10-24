import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("Altovena background jobs remain unscheduled until an approved release",()=>{
 const vercel=JSON.parse(readFileSync("vercel.json","utf8"));
 const scheduled=(vercel.crons||[]).map(row=>row.path);
 for(const route of ["/api/cron/altovena-lead-alerts",
   "/api/cron/altovena-delivery-preflight",
   "/api/cron/altovena-smtp-staging"]){
   assert.equal(scheduled.includes(route),false,
     "Altovena cron must be activated in a separate approved release: "+route);
 }
});
