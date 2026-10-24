import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAltovenaSupabase } from "./supabase";
import { assessAltovenaDatabaseIsolation } from "./preview-database-isolation";
import { hasVerifiedBrandGrant } from "@/lib/workspaces/brand-policy";

type AuthenticatedUser = {id:string;email:string};
type AdmissionDependencies = {
  authenticate: (email:string,password:string)=>Promise<
    {user:AuthenticatedUser|null;error:boolean}>;
  stagingDb:Pick<SupabaseClient,"rpc"|"auth">;
};
export type StagingAdmissionResult =
  | {ok:true;identity:AuthenticatedUser}
  | {ok:false;reason:"STAGING_DISABLED"|"AUTH_REJECTED"|"GRANT_UNAVAILABLE"|"GRANT_DENIED"};

const emailPattern=/^[^\s@<>]{1,64}@[^\s@<>]+\.[^\s@<>]+$/;
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

/**
 * Staging-only credential admission logic. No web route, cookie or platform
 * session is issued by this function. Injected dependencies allow testing
 * without ever communicating with live Supabase.
 */
export async function admitAltovenaStagingUser(
  email:string,password:string,deps:AdmissionDependencies,
):Promise<StagingAdmissionResult>{
  if(!assessAltovenaDatabaseIsolation().allowed ||
     process.env.VERCEL_ENV!=="preview")
    return {ok:false,reason:"STAGING_DISABLED"};
  const normalized=String(email||"").trim().toLowerCase();
  if(!emailPattern.test(normalized) || normalized.length>254 ||
     !password || password.length>1024)
    return {ok:false,reason:"AUTH_REJECTED"};

  let identity:AuthenticatedUser|null=null;
  try {
    const result=await deps.authenticate(normalized,password);
    if(result.error || !result.user || !uuid.test(result.user.id) ||
       result.user.email.trim().toLowerCase()!==normalized)
      return {ok:false,reason:"AUTH_REJECTED"};
    identity={id:result.user.id,email:normalized};
  }catch{return {ok:false,reason:"AUTH_REJECTED"};}

  try {
    const {data:scope,error}=await deps.stagingDb.rpc("workspace_brand_grant",{
      p_brand_key:"altovena",p_email:normalized,
    });
    if(error || !scope?.brand || scope.brand.brand_key!=="altovena" ||
       typeof scope.brand.id!=="string" || !scope.grant)
      return {ok:false,reason:"GRANT_UNAVAILABLE"};
    const verified=await deps.stagingDb.auth.admin.getUserById(identity.id);
    if(verified.error || !verified.data.user ||
       !hasVerifiedBrandGrant({
         grant:scope.grant,brandId:scope.brand.id,sessionEmail:normalized,
         verifiedUserId:identity.id,
         verifiedUserEmail:verified.data.user.email||"",permission:"crm.read",
       }))
       return {ok:false,reason:"GRANT_DENIED"};
  }catch{return {ok:false,reason:"GRANT_UNAVAILABLE"};}
  return {ok:true,identity};
}

/** Returns null unless all required separate staging credentials are present. */
export function getAltovenaStagingAdmissionDependencies():
  AdmissionDependencies|null {
  if(process.env.VERCEL_ENV!=="preview" ||
     !assessAltovenaDatabaseIsolation().allowed)return null;
  const url=process.env.ALTOVENA_STAGING_SUPABASE_URL;
  const publishable=process.env.ALTOVENA_STAGING_SUPABASE_ANON_KEY;
  if(!url || !publishable || publishable===process.env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY)
    return null;
  const stageDb=getAltovenaSupabase();
  if(!stageDb)return null;
  const publicAuth=createClient(url,publishable,{
    auth:{autoRefreshToken:false,persistSession:false},
  });
  return {
    stagingDb:stageDb,
    authenticate:async(email,password)=>{
      const {data,error}=await publicAuth.auth.signInWithPassword({email,password});
      return {user:data?.user?.id && data.user.email
        ? {id:data.user.id,email:data.user.email}:null,error:!!error};
    },
  };
}
