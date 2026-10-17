/**
 * OFFLINE CROSS-REPOSITORY E2E CONTRACT
 *
 * Runs the ACTUAL Altovena website api/contact.js -> ACTUAL RealtyFlow Next POST
 * -> ACTUAL Altovena intake PostgreSQL function in disposable PostgreSQL 17.
 * All HTTP edges (Turnstile, RealtyFlow HTTPS, Supabase PostgREST) are replaced
 * with narrowly routed in-process test transports. No production network calls,
 * real users, cloud DB writes, actual CAPTCHA or emails.
 *
 * The website repo is checked out separately at a PINNED commit by CI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { NextRequest } from "next/server";
import { POST as realtyFlowPost } from "../src/app/api/public/altovena-leads/route";

const databaseUrl = new URL(process.env.ALTOVENA_TEST_DATABASE_URL || "");
if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname) ||
    databaseUrl.pathname !== "/altovena_ci_test")
  throw Error("Cross-repo E2E requires the isolated local altovena_ci_test database.");

const websiteFile = resolve("altovena-website/api/contact.js");
let websiteHandler: (request:unknown,response:unknown)=>Promise<unknown>;

const websiteOrigin = "https://altovena.com";
const realtyFlowTarget = "https://realtyflow.chatgenius.pro/api/public/altovena-leads";
const mockSupabase = "https://altovena-contract-db.invalid";
const key = "offline-cross-repo-synthetic-key-2026-only";
const submissionId = "e37df975-f20d-45e0-a6cf-85eaf50f97ab";
const form = {
  name:"Synthetic Altovena Website", company:"Synthetic Example Ltd",
  email:"website-customer@example.invalid", product:"visibility",
  needs:"I would like information about visibility and human-approved SEO changes.",
  website:"", challengeToken:"turnstile-synthetic-1",
  submissionId, pageUrl:websiteOrigin+"/en/book-demo/",
};

const envNames = [
  "ALTOVENA_TEST_DATABASE_URL", "ALTOVENA_INTAKE_ENABLED", "ALTOVENA_INTAKE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
  "PUBLIC_LAUNCH", "SITEWIDE_EDITORIAL_APPROVED", "CONTACT_FORM_ENABLED",
  "PRIVACY_APPROVED", "SITE_URL", "PRIVACY_CONTROLLER_NAME",
  "PRIVACY_CONTACT_EMAIL", "PRIVACY_RETENTION_NO", "PRIVACY_RETENTION_EN",
  "TURNSTILE_SECRET_KEY", "REALTYFLOW_ALTOVENA_INTAKE_URL",
  "REALTYFLOW_ALTOVENA_INTAKE_KEY",
] as const;
const originalEnv = Object.fromEntries(envNames.map(name => [name,process.env[name]]));
const originalFetch = globalThis.fetch;
let turnstileCalls=0,websiteToRealtyFlow=0,rpcCalls=0;
let rejectTurnstile=false;
const db = new pg.Client({
  connectionString:process.env.ALTOVENA_TEST_DATABASE_URL,
  connectionTimeoutMillis:5000,
});

function siteRequest(payload:Record<string,unknown>,overrides:Record<string,string>={}) {
  return {
    method:"POST",
    headers:{
      host:"altovena.com",origin:websiteOrigin,"content-type":"application/json",
      "content-length":String(Buffer.byteLength(JSON.stringify(payload),"utf8")),
      ...overrides,
    },
    body:payload,
  };
}
function siteResponse() {
  return {
    statusCode:200,
    body:null as unknown,
    headers:{} as Record<string,string>,
    setHeader(name:string,value:string){this.headers[name.toLowerCase()]=value;return this;},
    status(status:number){this.statusCode=status;return this;},
    json(value:unknown){this.body=value;return this;},
  };
}
async function submit(payload=form as Record<string,unknown>,extraHeaders:Record<string,string>={}) {
  const response = siteResponse();
  await websiteHandler(siteRequest(payload,extraHeaders),response);
  return response;
}
async function main() {
  const loaded = await import(pathToFileURL(websiteFile).href);
  websiteHandler=loaded.default;
  assert.equal(typeof websiteHandler, "function", "Pinned Altovena website handler missing");
  await db.connect();
  let transactionOpen=false;
  try {
    await db.query("BEGIN");
    transactionOpen=true;
    await db.query(readFileSync("scripts/fixtures/altovena-ci-schema.sql","utf8"));
    await db.query(readFileSync("supabase/migrations/20261014210000_altovena_brand_intake.sql","utf8"));
    await db.query("SET LOCAL ROLE service_role");

    Object.assign(process.env,{
      ALTOVENA_INTAKE_ENABLED:"true",ALTOVENA_INTAKE_KEY:key,
      NEXT_PUBLIC_SUPABASE_URL:mockSupabase,SUPABASE_SERVICE_ROLE_KEY:"synthetic-key-not-real",
      PUBLIC_LAUNCH:"true",SITEWIDE_EDITORIAL_APPROVED:"true",
      CONTACT_FORM_ENABLED:"true",PRIVACY_APPROVED:"true",
      SITE_URL:websiteOrigin,PRIVACY_CONTROLLER_NAME:"CI only",
      PRIVACY_CONTACT_EMAIL:"privacy@example.invalid",
      PRIVACY_RETENTION_NO:"synthetic-only",PRIVACY_RETENTION_EN:"synthetic-only",
      TURNSTILE_SECRET_KEY:"synthetic-captcha-secret",
      REALTYFLOW_ALTOVENA_INTAKE_URL:realtyFlowTarget,
      REALTYFLOW_ALTOVENA_INTAKE_KEY:key,
    });

    // Strict allowlist: no test can accidentally leave the ephemeral process.
    globalThis.fetch=(async(input:RequestInfo | URL, init?:RequestInit)=>{
      const target=String(input);
      if (target==="https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        turnstileCalls++;
        assert.equal(init?.method,"POST");
        return new Response(JSON.stringify({
          success:!rejectTurnstile,hostname:"altovena.com",
        }),{status:200,headers:{"content-type":"application/json"}});
      }
      if (target===realtyFlowTarget) {
        websiteToRealtyFlow++;
        assert.equal(init?.method,"POST");
        assert.equal(new Headers(init?.headers).get("x-altovena-ingest-key"),key);
        return realtyFlowPost(new NextRequest(target,{
          method:"POST",headers:init?.headers,
          body:String(init?.body??""),
        }));
      }
      if (target===mockSupabase+"/rest/v1/rpc/altovena_receive_lead") {
        rpcCalls++;
        assert.equal(init?.method,"POST");
        assert.equal(new Headers(init?.headers).get("apikey"),
          process.env.SUPABASE_SERVICE_ROLE_KEY);
        const params=JSON.parse(String(init?.body||"{}"));
        assert.deepEqual(Object.keys(params).sort(),[
          "p_company","p_email","p_message","p_name","p_product","p_submission_id",
        ]);
        await db.query("SAVEPOINT cross_repo_request");
        try{
          const sql=await db.query(
            "SELECT public.altovena_receive_lead($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text) AS receipt",
            [params.p_submission_id,params.p_name,params.p_email,
             params.p_company,params.p_message,params.p_product],
          );
          await db.query("RELEASE SAVEPOINT cross_repo_request");
          return new Response(JSON.stringify(sql.rows[0].receipt),
            {status:200,headers:{"content-type":"application/json"}});
        }catch(error){
          await db.query("ROLLBACK TO SAVEPOINT cross_repo_request");
          await db.query("RELEASE SAVEPOINT cross_repo_request");
          return new Response(JSON.stringify({
            code:"22023",
            message:error instanceof Error?error.message:"SQL error",
          }),{status:400,headers:{"content-type":"application/json"}});
        }
      }
      throw Error("Unexpected outbound network request in offline E2E test.");
    }) as typeof fetch;

    const count=async(table:"contacts"|"work_items"|"altovena_intake_receipts",where?:string)=>{
      const safeWhere=where||"true";
      const result=await db.query(
        "SELECT count(*)::int AS total FROM public."+table+" WHERE "+safeWhere,
      );
      return Number(result.rows[0].total);
    };

    process.env.CONTACT_FORM_ENABLED="false";
    const blocked=await submit();
    assert.equal(blocked.statusCode,503);
    assert.equal(turnstileCalls,0);
    process.env.CONTACT_FORM_ENABLED="true";

    const forgedOrigin=await submit(form,{origin:"https://unknown.invalid"});
    assert.equal(forgedOrigin.statusCode,403);
    assert.equal(turnstileCalls,0);

    rejectTurnstile=true;
    const captchaDenied=await submit();
    assert.equal(captchaDenied.statusCode,403);
    assert.equal(websiteToRealtyFlow,0);
    rejectTurnstile=false;

    const accepted=await submit();
    assert.equal(accepted.statusCode,200);
    assert.deepEqual(accepted.body,{ok:true,received:true});
    assert.equal(accepted.headers["cache-control"],"no-store");
    assert.equal(turnstileCalls,2);
    assert.equal(websiteToRealtyFlow,1);
    assert.equal(rpcCalls,1);
    assert.equal(await count("contacts","brand_id='altovena'"),1);
    assert.equal(await count("work_items","brand_id='altovena' AND source_type='website_lead'"),1);
    assert.equal(await count("altovena_intake_receipts"),1);

    const first=await db.query(
      "SELECT id,email,nurture_status,ai_auto_followup FROM public.contacts WHERE brand_id='altovena'"
    );
    assert.equal(first.rows[0].email,form.email);
    assert.equal(first.rows[0].nurture_status,"stopped");
    assert.equal(first.rows[0].ai_auto_followup,false);

    // New CAPTCHA token after browser retry must not create a second CRM task.
    const retry=await submit({...form,challengeToken:"turnstile-synthetic-2"});
    assert.equal(retry.statusCode,200);
    assert.deepEqual(retry.body,{ok:true,received:true});
    assert.equal(await count("work_items","brand_id='altovena'"),1);
    assert.equal(await count("altovena_intake_receipts"),1);

    // A changed message with the old UUID cannot impersonate an exact retry.
    const edited=await submit({...form,needs:"Changed details with reused UUID",
      challengeToken:"turnstile-synthetic-3"});
    assert.equal(edited.statusCode,502);
    assert.deepEqual(edited.body,{ok:false,error:"REALTYFLOW_DELIVERY_FAILED"});
    assert.equal(await count("work_items","brand_id='altovena'"),1);
    assert.equal(await count("altovena_intake_receipts"),1);

    // If the RealtyFlow secret drifts, no CRM record is ever confirmed.
    process.env.REALTYFLOW_ALTOVENA_INTAKE_KEY="incorrect-synthetic-key";
    const mismatch=await submit({...form,submissionId:"3d42718b-97cd-4d55-a26b-9f4977d09a0e"});
    assert.equal(mismatch.statusCode,502);
    assert.equal(await count("work_items","brand_id='altovena'"),1);
    process.env.REALTYFLOW_ALTOVENA_INTAKE_KEY=key;

    assert.equal(await count("contacts","brand_id='zeneco'"),1);
    console.log("PASS cross-repo: REAL Altovena site handler -> REAL RealtyFlow intake handler -> REAL local Postgres; one lead/task; fail closed and exact retry");
  }finally{
    if (transactionOpen) await db.query("ROLLBACK").catch(()=>{});
    await db.end();
    globalThis.fetch=originalFetch;
    for(const [name,previous] of Object.entries(originalEnv)){
      if(previous===undefined)delete process.env[name];
      else process.env[name]=previous;
    }
  }
}

void main().catch(error=>{console.error(error);process.exitCode=1;});
