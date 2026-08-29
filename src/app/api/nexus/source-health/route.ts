import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildSourceHealth } from "@/lib/crm/source-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const contactsResult = await supabase
    .from("contacts")
    .select("id,source")
    .limit(5000);

  if (contactsResult.error) return NextResponse.json({ error: contactsResult.error.message }, { status: 500 });

  const health = buildSourceHealth(contactsResult.data || []);
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    ...health,
    safety: {
      readOnly: true,
      rawSourcePreserved: true,
      crmUpdated: false,
      attributionRewritten: false,
      externalActionExecuted: false,
    },
  });
}
