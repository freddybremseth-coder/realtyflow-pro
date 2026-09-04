import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";
import { buildTrajectory, type TrajectoryClaim, type TrajectoryGoal } from "@/lib/personal-intelligence/trajectory-service";

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
    const { data: subject, error: subjectError } = await supabase
      .schema("personal_core")
      .from("entities")
      .select("id,display_name,canonical_name")
      .eq("owner_user_id", ownerUserId)
      .eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME)
      .single();

    if (subjectError) throw new Error(subjectError.message);
    if (!subject?.id) return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });

    const [claimsResult, goalsResult] = await Promise.all([
      supabase.schema("personal_core").from("claims")
        .select("id,predicate,value_text,claim_type,status,confidence,privacy_level,source_id,source_excerpt,valid_from,valid_to,confirmed_at,updated_at")
        .eq("owner_user_id", ownerUserId)
        .eq("subject_entity_id", subject.id)
        .in("status", ["validated", "canonical"])
        .order("updated_at", { ascending: false })
        .limit(150),
      supabase.schema("personal_core").from("goals")
        .select("id,title,description,domain,goal_type,priority,status,target_date,why_it_matters,privacy_level,updated_at")
        .eq("owner_user_id", ownerUserId)
        .eq("subject_entity_id", subject.id)
        .order("updated_at", { ascending: false })
        .limit(100),
    ]);

    if (claimsResult.error) throw new Error(claimsResult.error.message);
    if (goalsResult.error) throw new Error(goalsResult.error.message);

    const trajectory = buildTrajectory(
      (claimsResult.data || []) as TrajectoryClaim[],
      (goalsResult.data || []) as TrajectoryGoal[],
    );

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      subject,
      ...trajectory,
      writesPerformed: 0,
    });
  } catch (error) {
    console.error("[Personal Intelligence Trajectory]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Trajectory read failed" }, { status: 500 });
  }
}
