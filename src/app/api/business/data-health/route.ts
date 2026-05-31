import { NextResponse } from "next/server";
import { getDataHealth } from "@/lib/business/data-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const report = await getDataHealth();
  return NextResponse.json(report);
}
