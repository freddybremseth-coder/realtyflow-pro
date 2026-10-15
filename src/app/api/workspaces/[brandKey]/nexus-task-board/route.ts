import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import { hasNexusTaskBoardViewGrant, loadNexusTaskBoard } from "@/lib/nexus/task-board-read";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
const headers = {"Cache-Control":"private, no-store, max-age=0"};
const fail=(status:number,code:string)=>NextResponse.json({ok:false,error:{code}},{status,headers});

/**
 * Brand-scoped, READ-ONLY staff board. Feature OFF unless two separate flags
 * are enabled. Reuses signed RealtyFlow session, active workspace grant and
 * Supabase Auth user verification; requires a second explicit 'view' grant
 * in the private Nexus DB. No mutations or agent execution exist here.
 */
export async function GET(request:NextRequest,{params}:{params:{brandKey:string}}){
  const brandKey=params.brandKey;
  if(!["zeneco","pinosoecolife"].includes(brandKey)) return fail(404,"WORKSPACE_NOT_FOUND");
  const access=await requireBrandWorkspace(request,brandKey,"nexus.read");
  if(!access.value)return access.response;
  const context=await getRequestAccessContext(request);
  if(!context || context.role!=="WORKSPACE_MEMBER" ||
    !["role-profile","owner-preview"].includes(context.source) ||
    !access.value.verifiedUserId) return fail(403,"MEMBER_SESSION_REQUIRED");
  if(process.env.NEXUS_TASK_BOARD_READ_ENABLED!=="true" ||
     process.env.NEXUS_TASK_BOARD_STAFF_READ_ENABLED!=="true") return fail(503,"NEXUS_STAFF_BOARD_DISABLED");
  const value=process.env.NEXUS_TASK_BOARD_DATABASE_URL;
  if(!value)return fail(503,"NEXUS_STAFF_BOARD_UNCONFIGURED");
  let url:URL;
  try{
    url=new URL(value);
    if(!["postgres:","postgresql:"].includes(url.protocol) ||
      (url.searchParams.has("sslmode") && url.searchParams.get("sslmode")!=="verify-full"))
      throw Error("TLS must be verified");
  }catch{return fail(503,"NEXUS_STAFF_BOARD_UNCONFIGURED");}
  let client:{connect():Promise<void>;query(sql:string,values:readonly unknown[]):Promise<{rows:Record<string,unknown>[]}>;end():Promise<void>}|null=null;
  try{
    const pg=require("pg") as {Client:new(opts:Record<string,unknown>)=>NonNullable<typeof client>};
    client=new pg.Client({
      connectionString:url.toString(),ssl:{rejectUnauthorized:true},
      connectionTimeoutMillis:4000,statement_timeout:4000,
      application_name:"realtyflow-nexus-task-board-staff-readonly"
    });
    await client.connect();
    // Grant verification uses DB policy independent of the workspace permission.
    const {brandId,verifiedUserId}=access.value;
    if(!await hasNexusTaskBoardViewGrant(client,brandId,verifiedUserId)) return fail(403,"NEXUS_TASK_BOARD_SCOPE_DENIED");
    // Exact brand + active grant also enforced in the SAME row-read SQL.
    const tasks=await loadNexusTaskBoard(client,brandId,verifiedUserId);
    if(tasks.some(task=>task.brandId!==brandId)) return fail(503,"NEXUS_STAFF_BOARD_SCOPE_MISMATCH");
    return NextResponse.json({ok:true,readOnly:true,brand:brandKey,tasks},{headers});
  }catch{
    return fail(503,"NEXUS_STAFF_BOARD_UNAVAILABLE");
  }finally{
    if(client)await client.end().catch(()=>undefined);
  }
}
