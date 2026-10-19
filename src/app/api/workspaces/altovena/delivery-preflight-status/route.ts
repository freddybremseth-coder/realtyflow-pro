import {createHmac} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {getRequestAccessContext} from "@/lib/api-admin";
import {requireBrandWorkspace} from "@/lib/workspaces/require-brand-workspace";

// Operator-only, read-only count of staged email candidates.
// A staged candidate is NOT a notification attempt and is NOT a delivery receipt.
export const dynamic="force-dynamic";
export const revalidate=0;
const headers={"Cache-Control":"private, no-store"};
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});

export async function GET(request:NextRequest){
 const context=await getRequestAccessContext(request);
 if(!context)return reply({ok:false,error:"AUTH_REQUIRED"},401);
 if(!((context.source==="owner-session" && context.role==="OWNER") ||
       (context.source==="role-profile" && context.role==="WORKSPACE_MEMBER")))
   return reply({ok:false,error:"HUMAN_SESSION_REQUIRED"},403);
 const access=await requireBrandWorkspace(request,"altovena","crm.read");
 if(!access.value)return access.response;
 if(access.value.verifiedEmail.trim().toLowerCase()!==context.email.trim().toLowerCase())
   return reply({ok:false,error:"INVALID_OPERATOR_SESSION"},403);

 if(process.env.ALTOVENA_DELIVERY_PREFLIGHT_ENABLED!=="true")
   return reply({ok:true,brand:"altovena",state:"disabled",
     prepared:0,cancelled:0,emailSent:false});
 const secret=process.env.ALTOVENA_ALERT_RECEIPT_HMAC_KEY;
 if(!secret || secret.length<32 || (context.role!=="OWNER" && !access.value.verifiedUserId))
   return reply({ok:false,error:"PREFLIGHT_UNAVAILABLE"},503);
 const principal=context.role==="OWNER"
   ? "owner:"+context.email.trim().toLowerCase()
   : "member:"+access.value.verifiedUserId;
 const key=createHmac("sha256",secret).update("altovena:inbox:v1:"+principal).digest("hex");
 const {data,error}=await access.value.supabase.rpc("altovena_operator_delivery_preflight",{
   p_operator_key:key,
 });
 if(error || data?.ok!==true || data?.brand!=="altovena" ||
    data?.deliveryAttempted!==false || data?.emailSent!==false ||
    ![data?.prepared,data?.cancelled].every(n=>Number.isSafeInteger(n) && n>=0))
   return reply({ok:false,error:"PREFLIGHT_UNAVAILABLE"},503);
 return reply({ok:true,brand:"altovena",state:"prepared_only",
   prepared:data.prepared,cancelled:data.cancelled,emailSent:false});
}
