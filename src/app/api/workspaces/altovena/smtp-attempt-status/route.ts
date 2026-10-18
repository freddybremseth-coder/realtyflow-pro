import {createHmac} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {getRequestAccessContext} from "@/lib/api-admin";
import {requireBrandWorkspace} from "@/lib/workspaces/require-brand-workspace";

export const dynamic="force-dynamic";
export const revalidate=0;
const headers={"Cache-Control":"private, no-store"};
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});

export async function GET(request:NextRequest){
 const context=await getRequestAccessContext(request);
 if(!context)return reply({ok:false,error:"AUTH_REQUIRED"},401);
 if(!((context.source==="owner-session"&&context.role==="OWNER") ||
      (context.source==="role-profile"&&context.role==="WORKSPACE_MEMBER")))
    return reply({ok:false,error:"HUMAN_SESSION_REQUIRED"},403);
 const access=await requireBrandWorkspace(request,"altovena","crm.read");
 if(!access.value)return access.response;
 if(context.email.trim().toLowerCase()!==access.value.verifiedEmail.trim().toLowerCase())
    return reply({ok:false,error:"INVALID_OPERATOR_SESSION"},403);
 const configured=process.env.VERCEL_ENV==="preview" &&
   process.env.ALTOVENA_EMAIL_STAGING_SEND_ENABLED==="true";
 if(!configured)return reply({ok:true,brand:"altovena",state:"disabled",
   attempting:0,smtpAccepted:0,outcomeUnknown:0,deliveryConfirmed:false});

 const secret=process.env.ALTOVENA_ALERT_RECEIPT_HMAC_KEY;
 if(!secret || secret.length<32 ||
    (context.role!=="OWNER" && !access.value.verifiedUserId))
    return reply({ok:false,error:"SMTP_STATUS_UNAVAILABLE"},503);
 const principal=context.role==="OWNER"
  ? "owner:"+context.email.trim().toLowerCase()
  : "member:"+access.value.verifiedUserId;
 const key=createHmac("sha256",secret)
  .update("altovena:inbox:v1:"+principal).digest("hex");
 const {data,error}=await access.value.supabase.rpc(
  "altovena_operator_smtp_status",{p_operator_key:key}
 );
 if(error || data?.ok!==true || data?.brand!=="altovena" ||
    data?.deliveryConfirmed!==false ||
    ![data?.attempting,data?.smtpAccepted,data?.outcomeUnknown].every(
      n=>Number.isSafeInteger(n)&&n>=0
    ))return reply({ok:false,error:"SMTP_STATUS_UNAVAILABLE"},503);
 return reply({ok:true,brand:"altovena",state:"staging",
   attempting:data.attempting,smtpAccepted:data.smtpAccepted,
   outcomeUnknown:data.outcomeUnknown,deliveryConfirmed:false});
}
