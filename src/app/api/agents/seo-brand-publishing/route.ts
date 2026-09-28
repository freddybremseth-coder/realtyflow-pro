export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { publisherForBrand } from "@/services/agents/seo-brand-publishing";
import { requestBrandRollback } from "@/services/agents/seo-brand-publisher";

/** Queue restoration of one exact, verified experiment. The cron performs the
 * normal source/check/deploy controls; this endpoint never edits GitHub directly. */
export async function POST(request: NextRequest) {
  const context = await getRequestAccessContext(request);
  if (context?.role !== "OWNER") return NextResponse.json({error:"Owner session required"},{status:403});
  const origin=request.headers.get("origin");
  if ((origin && origin!==request.nextUrl.origin) || request.headers.get("sec-fetch-site")==="cross-site" ||
      !request.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json({error:"Invalid request origin or content type"},{status:403});
  const body=await request.json().catch(()=>null);
  if (body?.action!=="rollback" || typeof body.brandId!=="string" || !publisherForBrand(body.brandId) ||
      typeof body.revision!=="string" || !/^[a-f0-9]{40}$/.test(body.revision))
    return NextResponse.json({error:"Exact approved brand and revision required"},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({error:"Publisher unavailable"},{status:503});
  try {
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    if (!await requestBrandRollback(db,body.brandId,body.revision))
      return NextResponse.json({error:"Publication changed; reload before rollback"},{status:409});
    return NextResponse.json({success:true,pending:true,note:"Tilbakeføringen følges opp automatisk i den daglige syklusen."},
      {headers:{"Cache-Control":"private, no-store"}});
  } catch {
    return NextResponse.json({error:"Rollback request could not be stored"},{status:503});
  }
}
