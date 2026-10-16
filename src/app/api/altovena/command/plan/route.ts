import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/platform/request";
import { buildAltovenaCommandRoutingPlan } from "@/lib/altovena/command-routing-plan";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const HEADERS = { "Cache-Control":"private, no-store", "X-Robots-Tag":"noindex, nofollow" };
const fail = (error:string,status:number) => NextResponse.json({error},{status,headers:HEADERS});
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

async function onlyOwner(request:NextRequest) {
  const access=await requirePlatformOwner(request);
  if (access.response || !access.value) return { context:null, response:access.response };
  if (access.value.context.source!=="owner-session") {
    return {context:null,response:fail("owner_session_required",403)};
  }
  return {context:access.value,response:null};
}

export async function GET(request:NextRequest) {
  const auth=await onlyOwner(request);
  if (auth.response) return auth.response;
  const missionId=request.nextUrl.searchParams.get("missionId");
  if (!missionId || !UUID.test(missionId)) return fail("invalid_mission",400);
  const {data,error}=await auth.context!.supabase.rpc("altovena_internal_command_plan_get",{
    p_mission_id:missionId,
  });
  if(error || !Array.isArray(data)) return fail("planning_gateway_unavailable",503);
  return NextResponse.json({proposal:data[0]??null,mode:"ROUTING_PROPOSAL_ONLY"},{headers:HEADERS});
}

export async function POST(request:NextRequest) {
  const auth=await onlyOwner(request);
  if(auth.response) return auth.response;
  if(!request.headers.get("origin") || request.headers.get("origin")!==request.nextUrl.origin) {
    return fail("origin_mismatch",403);
  }
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return fail("json_required",415);
  }
  if(Number(request.headers.get("content-length")||0)>5000) return fail("request_too_large",413);
  const raw=await request.text().catch(()=>"");
  if(raw.length>5000) return fail("request_too_large",413);
  let payload:unknown;
  try { payload=JSON.parse(raw); } catch { return fail("invalid_json",400); }
  if(!payload || typeof payload!=="object" || Array.isArray(payload)) return fail("invalid_payload",400);
  const body=payload as Record<string,unknown>;
  if(Object.keys(body).length!==1 || typeof body.missionId!=="string"
    || !UUID.test(body.missionId)) return fail("invalid_mission",400);

  const missionId=body.missionId.toLowerCase();
  const {data:drafts,error:draftError}=await auth.context!.supabase.rpc(
    "altovena_internal_command_plan_input",{p_mission_id:missionId}
  );
  if(draftError || !Array.isArray(drafts)) return fail("planning_gateway_unavailable",503);
  if(drafts.length!==1 || drafts[0].state!=="draft") return fail("mission_not_available",404);

  // Existing capability catalog + routing only. NO real agent invocation.
  const plan=buildAltovenaCommandRoutingPlan(missionId,drafts[0].goal);
  const {data,error}=await auth.context!.supabase.rpc(
    "altovena_internal_command_plan_propose",{
      p_actor_email:auth.context!.context.email,
      p_mission_id:missionId,
      p_plan:plan,
    }
  );
  if(error || !Array.isArray(data) || data.length!==1) {
    return fail("planning_proposal_not_saved",409);
  }
  return NextResponse.json({proposal:data[0],mode:"ROUTING_PROPOSAL_ONLY"},{
    status:201,headers:HEADERS,
  });
}
