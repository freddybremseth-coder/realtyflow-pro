export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { runLeadNurtureRequest } from "@/lib/nurture-api";

export const maxDuration = 120;

async function handle(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  return runLeadNurtureRequest(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
