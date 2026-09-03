import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";
import { buildTodaySnapshot } from "@/lib/personal-intelligence/today-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") {
      return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    }

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject, error } = await supabase
      .schema("personal_core")
      .from("entities")
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME)
      .single();

    if (error || !subject?.id) {
      return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });
    }

    const snapshot = await buildTodaySnapshot(supabase, ownerUserId, String(subject.id));
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    console.error("[Personal Intelligence TODAY]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TODAY generation failed" },
      { status: 500 },
    );
  }
}
