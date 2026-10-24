import {NextRequest,NextResponse} from "next/server";
import {assessAltovenaDatabaseIsolation} from "@/lib/altovena/preview-database-isolation";
import {getAltovenaStagingAdmissionDependencies,admitAltovenaStagingUser} from "@/lib/altovena/staging-admission";
import {ALTOVENA_STAGING_COOKIE,issueAltovenaStagingSession,verifyAltovenaStagingSession} from "@/lib/altovena/staging-session";
import {getAltovenaSupabase} from "@/lib/altovena/supabase";
import {hasVerifiedBrandGrant} from "@/lib/workspaces/brand-policy";
import {consumeAltovenaStagingLoginBudget} from "@/lib/altovena/staging-login-limit";

export const dynamic="force-dynamic";
export const revalidate=0;
const noStore={"Cache-Control":"private, no-store","Pragma":"no-cache"};
const response=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:noStore});
function trustedSameOrigin(request:NextRequest){
 const origin=request.headers.get("origin");
 const host=request.headers.get("host");
 const forwarded=request.headers.get("x-forwarded-host");
 if(!origin || !host || !forwarded || host!==forwarded)return false;
 try {
  const url=new URL(origin);
  return url.protocol==="https:" && url.host===host &&
    !url.username && !url.password && !url.search && !url.hash;
 }catch{return false;}
}
/**
 * No ability to create sessions unless BOTH the independent, provisioned
 * staging database and explicit staging-login switch are on. The global
 * RealtyFlow platform auth cookie and its session signer are never used.
 */
export async function POST(request:NextRequest){
 if(process.env.VERCEL_ENV!=="preview" ||
    process.env.ALTOVENA_STAGING_LOGIN_ENABLED!=="true" ||
    !assessAltovenaDatabaseIsolation().allowed)
  return response({ok:false,error:"STAGING_LOGIN_DISABLED"},503);
 if(!trustedSameOrigin(request))
  return response({ok:false,error:"STAGING_ORIGIN_REJECTED"},403);
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ||
    Number(request.headers.get("content-length")||"0")>4096)
  return response({ok:false,error:"INVALID_REQUEST"},400);
 let body:unknown;
 try{body=await request.json();}catch{return response({ok:false,error:"INVALID_REQUEST"},400);}
 if(!body || typeof body!=="object" || Array.isArray(body))
  return response({ok:false,error:"INVALID_REQUEST"},400);
 const values=body as Record<string,unknown>;
 if(typeof values.email!=="string" || typeof values.password!=="string" ||
    values.email.length>254 || values.password.length>1024)
  return response({ok:false,error:"INVALID_REQUEST"},400);
 // A missing limiter, migration, secret or connectivity MUST block admission.
 // Never authenticate a password first and count the attempt afterwards.
 if(!await consumeAltovenaStagingLoginBudget(values.email))
  return response({ok:false,error:"STAGING_LOGIN_UNAVAILABLE"},503);
 const deps=getAltovenaStagingAdmissionDependencies();
 if(!deps)return response({ok:false,error:"STAGING_LOGIN_UNAVAILABLE"},503);
 const admitted=await admitAltovenaStagingUser(values.email,values.password,deps);
 if(!admitted.ok)
  return response({ok:false,error:"INVALID_STAGING_CREDENTIALS"},401);
 const token=issueAltovenaStagingSession({
  userId:admitted.identity.id,email:admitted.identity.email,
 });
 if(!token)return response({ok:false,error:"STAGING_LOGIN_UNAVAILABLE"},503);
 const res=response({ok:true,brand:"altovena",scope:"staging-only",expiresInSeconds:900});
 res.cookies.set(ALTOVENA_STAGING_COOKIE,token,{
  httpOnly:true,secure:true,sameSite:"strict",path:"/api/altovena/staging-auth",
  maxAge:900,
 });
 return res;
}
export async function DELETE(request:NextRequest){
 if(process.env.VERCEL_ENV!=="preview")
  return response({ok:false,error:"STAGING_LOGIN_DISABLED"},503);
 if(!trustedSameOrigin(request))
  return response({ok:false,error:"STAGING_ORIGIN_REJECTED"},403);
 const res=response({ok:true,loggedOut:true});
 res.cookies.set(ALTOVENA_STAGING_COOKIE,"",{
  httpOnly:true,secure:true,sameSite:"strict",
  path:"/api/altovena/staging-auth",maxAge:0,
 });
 return res;
}

/** This endpoint is the only consumer of the staging cookie so far.
 * Neither possession of the token nor this response authorizes platform APIs.
 */
export async function GET(request:NextRequest){
 if(process.env.VERCEL_ENV!=="preview" ||
    process.env.ALTOVENA_STAGING_LOGIN_ENABLED!=="true" ||
    !assessAltovenaDatabaseIsolation().allowed)
   return response({ok:false,error:"STAGING_LOGIN_DISABLED"},503);
 const identity=verifyAltovenaStagingSession(
   request.cookies.get(ALTOVENA_STAGING_COOKIE)?.value,
 );
 if(!identity)return response({ok:false,error:"STAGING_SESSION_INVALID"},401);
 const db=getAltovenaSupabase();
 if(!db)return response({ok:false,error:"STAGING_SESSION_UNAVAILABLE"},503);
 try{
   const grant=await db.rpc("workspace_brand_grant",{
     p_brand_key:"altovena",p_email:identity.email,
   });
   if(grant.error || grant.data?.brand?.brand_key!=="altovena" ||
      typeof grant.data.brand.id!=="string" || !grant.data.grant)
     return response({ok:false,error:"STAGING_SESSION_REVOKED"},403);
   const auth=await db.auth.admin.getUserById(identity.userId);
   if(auth.error || !auth.data.user || !hasVerifiedBrandGrant({
     grant:grant.data.grant,brandId:grant.data.brand.id,
     sessionEmail:identity.email,verifiedUserId:identity.userId,
     verifiedUserEmail:auth.data.user.email||"",permission:"crm.read",
   }))return response({ok:false,error:"STAGING_SESSION_REVOKED"},403);
   return response({ok:true,brand:"altovena",scope:"staging-only",active:true});
 }catch{return response({ok:false,error:"STAGING_SESSION_UNAVAILABLE"},503);}
}
