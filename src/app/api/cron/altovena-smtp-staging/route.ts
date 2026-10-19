import { assessAltovenaDatabaseIsolation } from "@/lib/altovena/preview-database-isolation";
import { timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { getAltovenaSupabase } from "@/lib/altovena/supabase";
import { isAdminEmail } from "@/lib/admin-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { sendBrandEmail } from "@/services/email/send-brand-email";
import { runStagingOperatorSmtp } from "@/lib/altovena/dispatch-staging-operator-email";

export const dynamic="force-dynamic";
export const revalidate=0;
export const maxDuration=30;
const PATH="/api/cron/altovena-smtp-staging";
const noStore={"Cache-Control":"private, no-store"};
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:noStore});
function validBearer(request:NextRequest,secret:string){
 const authorization=request.headers.get("authorization")||"";
 if(!authorization.startsWith("Bearer ") || !secret)return false;
 const given=Buffer.from(authorization.slice(7),"utf8");
 const actual=Buffer.from(secret,"utf8");
 return given.length===actual.length && timingSafeEqual(given,actual);
}

export async function GET(request:NextRequest){
 const secret=process.env.CRON_SECRET;
 if(!secret || secret.length<16)
   return reply({ok:false,error:"CRON_NOT_CONFIGURED"},503);
 if(!validBearer(request,secret))return reply({ok:false,error:"UNAUTHORIZED"},401);

 // HARD staging boundary. No production URL or Vercel Cron can execute
 // outbound SMTP, even if an operator accidentally enables every other flag.
 if(process.env.VERCEL_ENV!=="preview" ||
    process.env.ALTOVENA_EMAIL_STAGING_SEND_ENABLED!=="true" ||
    process.env.ALTOVENA_DELIVERY_PREFLIGHT_ENABLED!=="true" ||
    process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED!=="true")
   return reply({ok:true,skipped:true,reason:"STAGING_SMTP_DISABLED",
     claimed:0,smtpAccepted:0,unknown:0,delivered:false});
 if (!assessAltovenaDatabaseIsolation().allowed)
   return reply({ok:false,error:"ALTOVENA_PREVIEW_DATABASE_NOT_ISOLATED",
     claimed:0,smtpAccepted:0,unknown:0,delivered:false},503);
 const safety=await evaluateCronSafeMode(PATH);
 if(safety.skip)return reply({ok:true,skipped:true,reason:"NEXUS_STOP",
   claimed:0,smtpAccepted:0,unknown:0,delivered:false});

 // Configured preview portal is the only link included in internal mail.
 const rawUrl=process.env.ALTOVENA_OPERATOR_PORTAL_URL;
 let portal:URL;
 try {
   if(!rawUrl)throw Error("not configured");
   portal=new URL(rawUrl);
   if(portal.protocol!=="https:" || portal.username || portal.password ||
      portal.search || portal.hash || portal.hostname==="localhost")
     throw Error("invalid");
 }catch{return reply({ok:false,error:"PORTAL_URL_UNAVAILABLE"},503);}

 const db=getAltovenaSupabase();
 if(!db)return reply({ok:false,error:"DATABASE_UNAVAILABLE"},503);
 // Existing brand-specific SMTP transport honours CRM suppression and requires
 // an active brand account. It returns SMTP acceptance, not actual delivery.
 const result=await runStagingOperatorSmtp({
   db,
   rawAllowlist:process.env.ALTOVENA_ALERT_RECIPIENT_EMAILS,
   hmacSecret:process.env.ALTOVENA_ALERT_RECEIPT_HMAC_KEY,
   isOwnerEmail:isAdminEmail,
   send:async(to,kind)=>{
     const subject=kind==="NOT_STARTED_24H"
       ? "Altovena – henvendelse uten oppfølging etter 24 timer"
       : "Altovena – oppfølging uten fremdrift etter 48 timer";
     const bodyText=[
       "Dette er et internt Altovena-varsel.",
       "En kundehenvendelse trenger oppfølging i RealtyFlow.",
       "Logg inn for å se detaljer. Ingen kundeopplysninger deles i denne e-posten.",
       portal.toString(),
     ].join("\n\n");
     const outcome=await sendBrandEmail(db,{
       brandId:"altovena",to:[to],subject,bodyText,
     });
     return {success:outcome.success,messageId:outcome.messageId};
   },
 });
 if(!result.ok)return reply({
   ok:false,error:result.code,
   claimed:result.claimed,smtpAccepted:result.smtpAccepted,
   unknown:result.unknown,delivered:false,
 },503);
 return reply(result);
}
