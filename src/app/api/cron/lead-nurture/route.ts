export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { requireCronApi } from "@/lib/api-cron";
import { runLeadNurtureRequest } from "@/lib/nurture-api";

// Vercel cron: kjører daglig. Følger opp ferske leads automatisk.
// SIKKERHET: dry-run som standard. Sender BARE ekte e-post når
// NURTURE_LIVE=true er satt i env, eller ?live=1 sendes manuelt.
export const maxDuration = 120;

async function handle(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  return runLeadNurtureRequest(request);
}

// Vercel cron kaller GET. POST tillates for manuell testing.
export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}
