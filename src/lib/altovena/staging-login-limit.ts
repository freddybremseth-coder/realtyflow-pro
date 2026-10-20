import "server-only";
import {createHmac} from "node:crypto";
import {getAltovenaSupabase} from "./supabase";
import {assessAltovenaDatabaseIsolation} from "./preview-database-isolation";

/**
 * Shared PostgreSQL atomically counts attempts across all serverless instances.
 * Never trust client-provided IP addresses for a security decision. A global
 * limiter plus per-normalized-account limiter prevents unbounded email spray.
 * Count BEFORE password verification. Fail CLOSED on any database error.
 */
export async function consumeAltovenaStagingLoginBudget(email:string):Promise<boolean>{
 if(process.env.VERCEL_ENV!=="preview" ||
    !assessAltovenaDatabaseIsolation().allowed)return false;
 const secret=process.env.ALTOVENA_STAGING_LOGIN_LIMIT_HMAC_KEY;
 if(!secret || secret.length<32 ||
    secret===process.env.ALTOVENA_STAGING_SESSION_SECRET ||
    secret===process.env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY)return false;
 const db=getAltovenaSupabase();
 if(!db)return false;
 const normalized=email.trim().toLowerCase();
 if(!normalized || normalized.length>254)return false;
 const key=(category:string,value:string)=>
   createHmac("sha256",secret)
     .update("altovena:login-limit:v1:"+category+":"+value)
     .digest("hex");
 try{
   // A global lockout limits distributed spray. It deliberately doesn't
   // reveal whether a particular email is an existing account.
   const global=await db.rpc("altovena_consume_login_limit",{
     p_identifier:key("global","all"),
     p_limit:300,p_window_seconds:900,
   });
   if(global.error || global.data!==true)return false;
   const account=await db.rpc("altovena_consume_login_limit",{
     p_identifier:key("account",normalized),
     p_limit:5,p_window_seconds:900,
   });
   return !account.error && account.data===true;
 }catch{return false;}
}
