import { assessAltovenaDatabaseIsolation } from "@/lib/altovena/preview-database-isolation";
import { timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { getPlatformSupabase } from "@/lib/platform/supabase";
import { isAdminEmail } from "@/lib/admin-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { resolveAltovenaDeliveryRecipients } from "@/lib/altovena/verified-delivery-recipients";

// DEVELOPMENT-ONLY: create bounded, brand-scoped delivery CANDIDATES.
// Does not call SMTP or another provider. No customer content is read.
export const dynamic="force-dynamic";
export const revalidate=0;
export const maxDuration=30;
const PATH="/api/cron/altovena-delivery-preflight";
const headers={"Cache-Control":"private, no-store"};
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
function authorized(request:NextRequest,secret:string){
  const bearer=request.headers.get("authorization");
  if(!bearer?.startsWith("Bearer ") || !secret)return false;
  const a=Buffer.from(bearer.slice(7),"utf8"),b=Buffer.from(secret,"utf8");
  return a.length===b.length && timingSafeEqual(a,b);
}

export async function GET(request:NextRequest){
  const secret=process.env.CRON_SECRET;
  if(!secret || secret.length<16)return reply({ok:false,error:"CRON_NOT_CONFIGURED"},503);
  if(!authorized(request,secret))return reply({ok:false,error:"UNAUTHORIZED"},401);
  if(process.env.ALTOVENA_DELIVERY_PREFLIGHT_ENABLED!=="true" ||
     process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED!=="true")
    return reply({ok:true,skipped:true,reason:"DELIVERY_PREFLIGHT_DISABLED",
      emailSent:false,deliveryAttempted:false});
  if (!assessAltovenaDatabaseIsolation().allowed)
    return reply({ok:false,error:"ALTOVENA_PREVIEW_DATABASE_NOT_ISOLATED",
      emailSent:false,deliveryAttempted:false},503);
  const safety=await evaluateCronSafeMode(PATH);
  if(safety.skip)return reply({ok:true,skipped:true,reason:"RUNTIME_CONTROL_DISABLED",
    emailSent:false,deliveryAttempted:false});

  const db=getPlatformSupabase();
  if(!db)return reply({ok:false,error:"DATABASE_UNAVAILABLE"},503);
  const recipients=await resolveAltovenaDeliveryRecipients(
    process.env.ALTOVENA_ALERT_RECIPIENT_EMAILS,
    process.env.ALTOVENA_ALERT_RECEIPT_HMAC_KEY,
    {supabase:db,isOwnerEmail:isAdminEmail},
  );
  if(!recipients.ok)
    return reply({ok:false,error:recipients.code,
      emailSent:false,deliveryAttempted:false},503);

  let newCandidates=0,cancelledCandidates=0,preparedTotal=0;
  for(const recipient of recipients.recipients){
    const {data,error}=await db.rpc("altovena_prepare_operator_delivery",{
      p_operator_key:recipient.operatorKey,p_limit:20,
    });
    if(error || data?.ok!==true || data?.brand!=="altovena" ||
       data?.deliveryAttempted!==false || data?.emailSent!==false ||
       ![data.newCandidates,data.cancelledCandidates,data.preparedTotal].every(
         n=>Number.isSafeInteger(n) && n>=0
       ))return reply({ok:false,error:"DELIVERY_PREPARATION_UNAVAILABLE",
         emailSent:false,deliveryAttempted:false},503);
    newCandidates+=data.newCandidates;
    cancelledCandidates+=data.cancelledCandidates;
    preparedTotal+=data.preparedTotal;
  }
  return reply({
    ok:true,brand:"altovena",recipientCount:2,newCandidates,
    cancelledCandidates,preparedTotal,
    emailSent:false,deliveryAttempted:false,
  });
}
