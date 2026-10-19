import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { assessAltovenaDatabaseIsolation } from "./preview-database-isolation";

/**
 * Staging-only, brand-and-project-scoped identity proof.
 *
 * This is intentionally NOT a RealtyFlow platform session. It is NOT read by
 * the global access context, platform middleware, or production routes.
 * Only a separately reviewed Altovena staging admission can issue it.
 */
export const ALTOVENA_STAGING_COOKIE = "altovena_staging_session";
const AUDIENCE = "altovena:staging-only:v1";
const MAX_AGE_SECONDS = 15 * 60;
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const emailPattern = /^[^\s@<>]{1,64}@[^\s@<>]+\.[^\s@<>]+$/;
type Payload = {
  aud: typeof AUDIENCE; brand:"altovena"; project:string;
  sub:string; email:string; iat:number; exp:number;
};
type SessionEnv = Pick<NodeJS.ProcessEnv,
  "VERCEL_ENV" | "ALTOVENA_STAGING_SESSION_SECRET" |
  "ALTOVENA_STAGING_SUPABASE_PROJECT_REF">;
function ready(env:NodeJS.ProcessEnv){
  if(env.VERCEL_ENV!=="preview" ||
     !assessAltovenaDatabaseIsolation(env).allowed)return null;
  const secret=env.ALTOVENA_STAGING_SESSION_SECRET;
  if(!secret || secret.length<48 || secret===env.REALTYFLOW_SESSION_SECRET ||
      secret===env.SUPABASE_SERVICE_ROLE_KEY ||
      secret===env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY)return null;
  return {secret,project:env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF!};
}
const sign=(encoded:string,secret:string)=>
  createHmac("sha256",secret).update(encoded).digest("base64url");

/** Caller must first independently authenticate and verify active staging grant. */
export function issueAltovenaStagingSession(
  actor:{userId:string;email:string}, now=Date.now(),
  env:NodeJS.ProcessEnv=process.env,
):string|null {
  const config=ready(env);
  const email=actor.email.trim().toLowerCase();
  if(!config || !uuid.test(actor.userId) || !emailPattern.test(email) ||
     !Number.isSafeInteger(now) || now<=0)return null;
  const iat=Math.floor(now/1000);
  const payload:Payload={
    aud:AUDIENCE,brand:"altovena",project:config.project,sub:actor.userId,
    email,iat,exp:iat+MAX_AGE_SECONDS,
  };
  const encoded=Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded+"."+sign(encoded,config.secret);
}

/** Only proves signed audience and identity; route must recheck live staging Auth/grant. */
export function verifyAltovenaStagingSession(
  token:string|undefined,now=Date.now(),
  env:NodeJS.ProcessEnv=process.env,
):{userId:string;email:string}|null {
  const config=ready(env);
  if(!config || !token || token.length>2048 || !Number.isSafeInteger(now))return null;
  const parts=token.split(".");
  if(parts.length!==2 || !parts[0] || !parts[1])return null;
  const expected=Buffer.from(sign(parts[0],config.secret),"utf8");
  const provided=Buffer.from(parts[1],"utf8");
  if(expected.length!==provided.length || !timingSafeEqual(expected,provided))
    return null;
  try{
    const data=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")) as Partial<Payload>;
    const seconds=Math.floor(now/1000);
    if(data.aud!==AUDIENCE || data.brand!=="altovena" ||
      data.project!==config.project || !data.sub || !uuid.test(data.sub) ||
      !data.email || !emailPattern.test(data.email) ||
      data.email!==data.email.toLowerCase() ||
      !Number.isSafeInteger(data.iat) || !Number.isSafeInteger(data.exp) ||
      data.iat!>seconds || seconds>=data.exp! ||
      data.exp!-data.iat! !== MAX_AGE_SECONDS)return null;
    return {userId:data.sub,email:data.email};
  }catch{return null;}
}
