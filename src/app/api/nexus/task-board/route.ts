import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { loadNexusTaskBoard, normalizeTaskBoardBrandFilter } from "@/lib/nexus/task-board-read";
import { parseNexusBoardDatabaseUrl, withNexusBoardReader } from "@/lib/nexus/task-board-connection";

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

  // Fail closed on unsafe URL options that override node-postgres SSL settings.
  try { parseNexusBoardDatabaseUrl(connectionString); }
  catch { return reply({ready:false,state:"unconfigured",message:"Ugyldig eller usikker lesetilkobling."},503); }

  try {
    const tasks=await withNexusBoardReader(
      connectionString,"realtyflow-nexus-task-board-readonly",
      client=>loadNexusTaskBoard(client,brandId)
    );
    return reply({ready:true,readOnly:true,tasks},200);
  } catch {
    return reply({ready:false,state:"unavailable",message:"Nexus-databasen kunne ikke leses. Ingen oppdrag er endret."},503);
  }
}
