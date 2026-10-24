import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

// One exact Altovena contact per authorized task click. Never a global
// customer lookup and never send interactions, notes or financial fields.
export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store" };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const columns="id,name,email,phone,brand_id,brand,pipeline_status,source,created_at,updated_at";

export async function GET(request: NextRequest, {params}: {params:{brandKey:string}}) {
  if (params.brandKey!=="altovena") return NextResponse.json(
    {ok:false,error:{code:"WORKSPACE_NOT_FOUND"}},
    {status:404,headers:noStore});
  const access=await requireBrandWorkspace(request,"altovena","crm.read");
  if(!access.value) return access.response;
  const url=new URL(request.url);
  const id=url.searchParams.get("contactId");
  if(!id || !uuid.test(id) ||
    [...url.searchParams.keys()].some(key=>key!=="contactId") ||
    url.searchParams.getAll("contactId").length!==1) return NextResponse.json(
    {ok:false,error:{code:"INVALID_CONTACT_ID"}},
    {status:400,headers:noStore});

  const {data,error}=await access.value.supabase
    .from("contacts").select(columns)
    .eq("brand_id","altovena").eq("brand","altovena").eq("id",id)
    .maybeSingle();
  if(error) return NextResponse.json(
    {ok:false,error:{code:"CRM_UNAVAILABLE"}},
    {status:503,headers:noStore});
  if(!data || data.id!==id || data.brand_id!=="altovena" ||
    data.brand!=="altovena" || typeof data.name!=="string" ||
    String(data.source||"").startsWith("__SPAM__:")) return NextResponse.json(
    {ok:false,error:{code:"CONTACT_NOT_FOUND"}},
    {status:404,headers:noStore});

  // Explicit response schema, even when a service_role query or mock provides
  // unexpected columns. Current grant is revalidated on every request.
  const contact={
    id,name:data.name.slice(0,140),
    email:typeof data.email==="string"?data.email:null,
    phone:typeof data.phone==="string"?data.phone:null,
    pipeline_status:typeof data.pipeline_status==="string"?data.pipeline_status:null,
    source:typeof data.source==="string"?data.source:null,
    created_at:typeof data.created_at==="string"?data.created_at:null,
    updated_at:typeof data.updated_at==="string"?data.updated_at:null,
  };
  return NextResponse.json({ok:true,brand:"altovena",contact},{headers:noStore});
}
