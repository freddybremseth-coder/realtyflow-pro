import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext } from "@/lib/api-admin";
import { appendProjectEvidenceLog } from "@/services/agents/visibility-project-evidence-log";
import { createProjectEvidenceWriter } from "@/services/agents/visibility-project-db-writer";
import { createProjectEvidenceStore } from "@/services/agents/visibility-project-evidence-store";
import type { ProjectEvidenceEvent } from "@/services/agents/visibility-project-evidence-history";

export const dynamic = "force-dynamic";
/**
 * Owner-only experimental evidence ingestion. DISABLED unless enabled explicitly
 * after index deployment, source checks, preflight and production approval.
 * This route does not accept attestation/revocation or authorize publication.
 */
export async function POST(request:NextRequest) {
  if(process.env.ALTOVENA_PROJECT_EVIDENCE_WRITES !== "enabled")
    return NextResponse.json({error:"Evidence recording is not enabled"},{status:503});
  const ctx=await getRequestAccessContext(request);
  if(ctx?.role!=="OWNER" || ctx.source!=="owner-session" || !ctx.email)
    return NextResponse.json({error:"Direct owner session required"},{status:403});
  const origin=request.headers.get("origin");
  if((origin && origin!==request.nextUrl.origin) || request.headers.get("sec-fetch-site")==="cross-site")
    return NextResponse.json({error:"Invalid origin"},{status:403});
  const raw=await request.text();
  if(raw.length>3000)return NextResponse.json({error:"Payload too large"},{status:413});
  let payload:unknown;
  try {payload=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid JSON"},{status:400});}
  if(!payload || typeof payload!=="object" || Array.isArray(payload))
    return NextResponse.json({error:"Invalid payload"},{status:400});
  const body=payload as Record<string,unknown>;
  if(typeof body.eventId!=="string" || typeof body.projectUrl!=="string" ||
    typeof body.claimKey!=="string" ||
    !["price","construction","delivery","energyClass","included","taxes","location"].includes(body.claimKey) ||
    !["SOURCE_RECORDED","REVIEW_REQUESTED"].includes(String(body.event)))
    return NextResponse.json({error:"Invalid evidence reference"},{status:400});

  // Actor, timestamp and scope are trusted-server values; not client input.
  const event:ProjectEvidenceEvent={
    eventId:body.eventId,projectUrl:body.projectUrl,brandId:"zeneco",
    claimKey:body.claimKey as ProjectEvidenceEvent["claimKey"],
    event:body.event as ProjectEvidenceEvent["event"],
    actorId:ctx.email,recordedAt:new Date().toISOString(),
  };
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:"Database unavailable"},{status:503});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    const writer=createProjectEvidenceWriter(createProjectEvidenceStore(db as unknown as Parameters<typeof createProjectEvidenceStore>[0]));
    const result=await appendProjectEvidenceLog(writer,event,ctx.email,true);
    return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch{
    return NextResponse.json({error:"Evidence event rejected or storage unavailable"},{status:409});
  }
}
