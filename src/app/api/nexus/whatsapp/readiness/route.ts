import { NextResponse } from "next/server";
import { assessWhatsAppReadiness } from "@/lib/nexus/whatsapp-readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const readiness = assessWhatsAppReadiness({
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    WHATSAPP_META_APP_SECRET: process.env.WHATSAPP_META_APP_SECRET,
    WHATSAPP_PHONE_BRAND_MAP: process.env.WHATSAPP_PHONE_BRAND_MAP,
    WHATSAPP_AUTOREPLY_ENABLED: process.env.WHATSAPP_AUTOREPLY_ENABLED,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_GRAPH_VERSION: process.env.WHATSAPP_GRAPH_VERSION,
  });

  return NextResponse.json({
    ok: true,
    channel: "whatsapp",
    generatedAt: new Date().toISOString(),
    readiness,
  });
}
