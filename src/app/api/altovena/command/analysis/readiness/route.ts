import { NextRequest, NextResponse } from "next/server";
import { requirePlatformOwner } from "@/lib/platform/request";

/** Owner-only status reporting. Never issues, attests or executes permits. */
export const dynamic = "force-dynamic";
export const revalidate = 0;
const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail = (error: string, status: number) =>
  NextResponse.json({error}, {status,headers:HEADERS});

export async function GET(request: NextRequest) {
  const auth=await requirePlatformOwner(request);
  if(auth.response || !auth.value)return auth.response;
  if(auth.value.context.source!=="owner-session")
    return fail("owner_session_required",403);
  const missionId=request.nextUrl.searchParams.get("missionId");
  if(!missionId || !UUID.test(missionId))return fail("invalid_mission",400);
  const {data,error}=await auth.value.supabase.rpc(
    "altovena_internal_command_analysis_status",{
      p_mission_id:missionId.toLowerCase(),
      p_actor_email:auth.value.context.email,
    });
  if(error || !Array.isArray(data) || data.length!==1)
    return fail("analysis_status_unavailable",503);
  return NextResponse.json({
    status:data[0],
    informationalOnly:true,
    executionStarted:false,
    permissionToExecute:false,
  },{headers:HEADERS});
}
