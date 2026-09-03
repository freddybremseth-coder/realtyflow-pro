import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase } from "@/lib/personal-intelligence/supabase";
import type { PersonalPrivacyLevel } from "@/lib/personal-intelligence/privacy-policy";

const PRIVACY_LEVELS = new Set<PersonalPrivacyLevel>(["public", "internal", "private", "sensitive", "restricted"]);

export async function POST(request: NextRequest) {
  let sourceId: string | null = null;
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") {
      return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const subjectEntityId = typeof body.subjectEntityId === "string" ? body.subjectEntityId.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 240) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 4000) : null;
    const sourceExcerpt = typeof body.sourceExcerpt === "string" ? body.sourceExcerpt.trim().slice(0, 4000) : title;
    const privacyLevel = (typeof body.privacyLevel === "string" ? body.privacyLevel : "internal") as PersonalPrivacyLevel;

    if (!subjectEntityId || !title) return NextResponse.json({ error: "subjectEntityId and title are required" }, { status: 400 });
    if (!PRIVACY_LEVELS.has(privacyLevel)) return NextResponse.json({ error: "Invalid privacyLevel" }, { status: 400 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject } = await supabase.schema("personal_core").from("entities").select("id")
      .eq("id", subjectEntityId).eq("owner_user_id", ownerUserId).maybeSingle();
    if (!subject) return NextResponse.json({ error: "Subject not found for owner" }, { status: 404 });

    const { data: source, error: sourceError } = await supabase.schema("personal_core").from("sources").insert({
      owner_user_id: ownerUserId,
      source_type: "direct_user_statement",
      source_name: "orientation_confirmation",
      source_system: "personal_intelligence",
      reliability_class: "direct_current_user_confirmation",
      privacy_level: privacyLevel,
      source_date: new Date().toISOString(),
      metadata: { source_excerpt: sourceExcerpt, orientation: true },
    }).select("id").single();
    if (sourceError || !source?.id) throw new Error(sourceError?.message || "Goal source creation failed");
    sourceId = source.id;

    const { data: goal, error: goalError } = await supabase.schema("personal_core").from("goals").insert({
      owner_user_id: ownerUserId,
      subject_entity_id: subjectEntityId,
      title,
      description,
      goal_type: "orientation_candidate",
      priority: 3,
      status: "idea",
      source_id: sourceId,
      privacy_level: privacyLevel,
    }).select("id,title,status,privacy_level,created_at").single();
    if (goalError || !goal) throw new Error(goalError?.message || "Goal creation failed");

    return NextResponse.json({ ok: true, goal, sourceId });
  } catch (error) {
    console.error("[Personal Intelligence Goal Confirm]", error);
    try {
      if (sourceId) {
        const supabase = getPersonalIntelligenceSupabase();
        await supabase.schema("personal_core").from("sources").delete().eq("id", sourceId);
      }
    } catch {}
    return NextResponse.json({ error: error instanceof Error ? error.message : "Goal confirmation failed" }, { status: 500 });
  }
}
