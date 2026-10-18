import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasVerifiedBrandGrant } from "@/lib/workspaces/brand-policy";

export type VerifiedAltovenaRecipient = {
  // Never return operator email from an API or put it in an audit log.
  operatorKey: string;
  recipientType: "OWNER" | "WORKSPACE_MEMBER";
};
export type RecipientVerification =
  | { ok: true; recipients: VerifiedAltovenaRecipient[] }
  | { ok: false; code: "INVALID_RECIPIENT_CONFIGURATION" |
      "RECIPIENT_IDENTITY_UNVERIFIED" | "GRANT_LOOKUP_UNAVAILABLE" };

type Dependencies = {
  supabase: Pick<SupabaseClient,"rpc"|"auth">;
  isOwnerEmail: (email:string)=>boolean;
};
const emailPattern=/^[^\s@<>]{1,64}@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * A deliberate two-recipient, no-PII delivery PREPARATION plan.
 * Only configured admin email or independently Supabase Auth-verified active
 * Altovena crm.read staff grant can be a candidate. No email is sent here.
 */
export async function resolveAltovenaDeliveryRecipients(
  rawAllowlist:string | undefined, hmacKey:string | undefined,
  dependencies:Dependencies,
):Promise<RecipientVerification>{
  if(!hmacKey || hmacKey.length<32 || !rawAllowlist)
    return {ok:false,code:"INVALID_RECIPIENT_CONFIGURATION"};
  const emails=rawAllowlist.split(",").map(v=>v.trim().toLowerCase());
  if(emails.length!==2 || emails.some(e=>!emailPattern.test(e) || e.length>254) ||
      new Set(emails).size!==2)
    return {ok:false,code:"INVALID_RECIPIENT_CONFIGURATION"};
  const result:VerifiedAltovenaRecipient[]=[];
  const brandIds=new Set<string>();
  for(const email of emails){
    const {data:scope,error}=await dependencies.supabase.rpc("workspace_brand_grant",{
      p_brand_key:"altovena",p_email:email,
    });
    if(error)return {ok:false,code:"GRANT_LOOKUP_UNAVAILABLE"};
    if(!scope?.brand?.id || scope.brand.brand_key!=="altovena" ||
       typeof scope.brand.id!=="string")
      return {ok:false,code:"RECIPIENT_IDENTITY_UNVERIFIED"};
    brandIds.add(scope.brand.id);

    let principal:string,recipientType:VerifiedAltovenaRecipient["recipientType"];
    if(dependencies.isOwnerEmail(email)){
      principal="owner:"+email;
      recipientType="OWNER";
    }else{
      const grant=scope.grant;
      if(!grant?.user_id || typeof grant.user_id!=="string")
        return {ok:false,code:"RECIPIENT_IDENTITY_UNVERIFIED"};
      const {data:verified,error:authError}=await dependencies.supabase.auth.admin
        .getUserById(grant.user_id);
      if(authError || !verified?.user || !hasVerifiedBrandGrant({
        grant,brandId:scope.brand.id,sessionEmail:email,
        verifiedUserId:verified.user.id,
        verifiedUserEmail:verified.user.email||"",permission:"crm.read",
      }))return {ok:false,code:"RECIPIENT_IDENTITY_UNVERIFIED"};
      principal="member:"+verified.user.id;
      recipientType="WORKSPACE_MEMBER";
    }
    const operatorKey=createHmac("sha256",hmacKey)
      .update("altovena:inbox:v1:"+principal).digest("hex");
    result.push({operatorKey,recipientType});
  }
  if(brandIds.size!==1 || result[0].operatorKey===result[1].operatorKey ||
     result.filter(r=>r.recipientType==="OWNER").length!==1 ||
     result.filter(r=>r.recipientType==="WORKSPACE_MEMBER").length!==1)
    return {ok:false,code:"RECIPIENT_IDENTITY_UNVERIFIED"};
  return {ok:true,recipients:result};
}
