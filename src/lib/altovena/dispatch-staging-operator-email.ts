import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAltovenaDeliveryRecipients } from "@/lib/altovena/verified-delivery-recipients";

type SmtpSend = (recipientEmail:string,kind:"NOT_STARTED_24H"|"IN_PROGRESS_48H")=>
  Promise<{success:boolean;messageId?:string}>;
type Inputs = {
  db: Pick<SupabaseClient,"rpc"|"auth">;
  rawAllowlist: string | undefined;
  hmacSecret: string | undefined;
  isOwnerEmail: (email:string)=>boolean;
  send: SmtpSend;
};
type Outcome = {ok:true;brand:"altovena";recipientCount:2;claimed:number;
  smtpAccepted:number;unknown:number;delivered:false}
 | {ok:false;code:string;claimed:number;smtpAccepted:number;unknown:number;delivered:false};
const acceptedKinds=new Set(["NOT_STARTED_24H","IN_PROGRESS_48H"]);
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

export async function runStagingOperatorSmtp(inputs:Inputs):Promise<Outcome>{
  let claimed=0,smtpAccepted=0,unknown=0;
  const fail=(code:string):Outcome=>({ok:false,code,claimed,smtpAccepted,unknown,delivered:false});
  const initial=await resolveAltovenaDeliveryRecipients(
    inputs.rawAllowlist,inputs.hmacSecret,{
      supabase:inputs.db,isOwnerEmail:inputs.isOwnerEmail,
    });
  if(!initial.ok)return fail(initial.code);
  // This is the ONLY source of email addresses, validated by exact active
  // brand/owner and independent Supabase Auth checks; not persisted in our ledger.
  const addresses=inputs.rawAllowlist!.split(",").map(v=>v.trim().toLowerCase());
  if(addresses.length!==2)return fail("INVALID_RECIPIENT_CONFIGURATION");

  for(let i=0;i<2;i++){
    // Recheck live recipient grants immediately before selecting the candidate.
    // Revoking either operator blocks all remaining sends on the first failure.
    const fresh=await resolveAltovenaDeliveryRecipients(
      inputs.rawAllowlist,inputs.hmacSecret,{
        supabase:inputs.db,isOwnerEmail:inputs.isOwnerEmail,
      });
    if(!fresh.ok)return fail(fresh.code);
    if(fresh.recipients[i].operatorKey!==initial.recipients[i].operatorKey)
      return fail("RECIPIENT_CHANGED");

    const operatorKey=fresh.recipients[i].operatorKey;
    const {data:claim,error:claimError}=await inputs.db.rpc(
      "altovena_claim_operator_smtp",{p_operator_key:operatorKey}
    );
    if(claimError || claim?.ok!==true || claim?.brand!=="altovena" ||
       claim?.smtpAccepted!==false || claim?.delivered!==false ||
       typeof claim?.claimed!=="boolean")
      return fail("SMTP_CLAIM_FAILED");
    if(!claim.claimed)continue;
    if(!uuid.test(String(claim.attemptId||"")) || !acceptedKinds.has(claim.kind))
      return fail("INVALID_CLAIM");
    claimed++;
    // The claim is durable BEFORE the SMTP call. A process crash leaves
    // ATTEMPTING, which MUST NEVER be reclaimed automatically.
    let state:"SMTP_ACCEPTED"|"OUTCOME_UNKNOWN"="OUTCOME_UNKNOWN";
    let messageId:string|null=null;
    try{
      const result=await inputs.send(addresses[i],claim.kind);
      if(result.success && typeof result.messageId==="string" &&
         result.messageId.length>=3 && result.messageId.length<=255 &&
         !/[\x00-\x1f\x7f]/.test(result.messageId)){
        state="SMTP_ACCEPTED";
        messageId=result.messageId;
      }
    }catch{
      // Never log recipient, transport error, content or credentials.
      // An exception can occur AFTER SMTP accepted the message.
    }
    const {data:finish,error:finishError}=await inputs.db.rpc(
      "altovena_finalize_operator_smtp",{
        p_attempt_id:claim.attemptId,
        p_operator_key:operatorKey,
        p_outcome:state,
        p_message_id:messageId,
      }
    );
    if(finishError || finish?.ok!==true || finish?.brand!=="altovena" ||
       finish?.state!==state || finish?.delivered!==false ||
       finish?.smtpAccepted!==(state==="SMTP_ACCEPTED"))
      return fail("SMTP_OUTCOME_UNAVAILABLE");
    if(state==="SMTP_ACCEPTED")smtpAccepted++;
    else unknown++;
  }
  return {ok:true,brand:"altovena",recipientCount:2,
    claimed,smtpAccepted,unknown,delivered:false};
}
