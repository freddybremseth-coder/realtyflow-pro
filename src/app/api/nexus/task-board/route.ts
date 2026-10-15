import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { loadNexusTaskBoard, normalizeTaskBoardBrandFilter } from "@/lib/nexus/task-board-read";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };
const reply = (data: Record<string,unknown>,status:number) => NextResponse.json(data,{status,headers:noStore});

/**
 * Private, read-only owner view. Deliberately disabled until a reviewed,
 * least-privilege PostgreSQL connection can read the private core schema.
 * The connection string is server-only and NEVER sent in the response.
 * No mutation method, approval action or executor is exposed here.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const access = await getRequestAccessContext(request);
  // Disallow impersonation/preview sessions, proxy identities and staff role
  // profiles even if they share an owner-looking email.
  if (!access || access.role !== "OWNER" || access.source !== "owner-session" || access.preview) {
    return reply({error:"OWNER_SESSION_REQUIRED"},403);
  }
  if (process.env.NEXUS_TASK_BOARD_READ_ENABLED !== "true") {
    return reply({ready:false,state:"disabled",message:"Nexus-oppdragsoversikten er ikke aktivert."},503);
  }
  const connectionString = process.env.NEXUS_TASK_BOARD_DATABASE_URL;
  if (!connectionString) {
    return reply({ready:false,state:"unconfigured",message:"Sikker lesetilkobling til Nexus-databasen er ikke konfigurert."},503);
  }
  let brandId: string|null;
  try {
    brandId=normalizeTaskBoardBrandFilter(request.nextUrl.searchParams.get("brandId"));
  } catch {
    return reply({error:"INVALID_BRAND_FILTER"},400);
  }

  // Require TLS certificate verification; refuse arbitrary URL schemes.
  let dbUrl: URL;
  try {
    dbUrl=new URL(connectionString);
    if (!["postgres:","postgresql:"].includes(dbUrl.protocol)) throw Error("invalid scheme");
    if (dbUrl.searchParams.has("sslmode") && dbUrl.searchParams.get("sslmode") !== "verify-full") {
      throw Error("unsafe SSL mode");
    }
  } catch {
    return reply({ready:false,state:"unconfigured",message:"Ugyldig eller usikker lesetilkobling."},503);
  }

  let client: {connect():Promise<void>;query(sql:string,values:readonly unknown[]):Promise<{rows:Record<string,unknown>[]}>;end():Promise<void>}|null=null;
  try {
    // pg is used only on the server after owner auth + explicit activation.
    const pg=require("pg") as {Client:new(options:Record<string,unknown>)=>NonNullable<typeof client>};
    client=new pg.Client({
      connectionString:dbUrl.toString(),
      ssl:{rejectUnauthorized:true},
      connectionTimeoutMillis:4000,
      statement_timeout:4000,
      application_name:"realtyflow-nexus-task-board-readonly",
    });
    await client.connect();
    const tasks=await loadNexusTaskBoard(client,brandId);
    return reply({ready:true,readOnly:true,tasks},200);
  } catch {
    // Never leak database diagnostics, credentials or customer record details.
    return reply({ready:false,state:"unavailable",message:"Nexus-databasen kunne ikke leses. Ingen oppdrag er endret."},503);
  } finally {
    if (client) await client.end().catch(()=>undefined);
  }
}
