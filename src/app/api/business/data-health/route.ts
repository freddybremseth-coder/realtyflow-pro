import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getDataHealth } from "@/lib/business/data-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const report = await getDataHealth();
  return NextResponse.json(report);
}
