import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { createConfirmedClaim } from "@/lib/personal-intelligence/claim-service";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase } from "@/lib/personal-intelligence/supabase";
import type { PersonalPrivacyLevel } from "@/lib/personal-intelligence/privacy-policy";

const PRIVACY_LEVELS = new Set<PersonalPrivacyLevel>(["public", "internal", "private", "sensitive", "restricted"]);

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const subjectEntityId = typeof body.subjectEntityId === "string" ? body.subjectEntityId.trim() : "";
    const predicate = typeof body.predicate === "string" ? body.predicate.trim() : "";
    const statement = typeof body.statement === "string" ? body.statement.trim() : "";
    const privacyLevel = (typeof body.privacyLevel === "string" ? body.privacyLevel : "internal") as PersonalPrivacyLevel;

    if (!subjectEntityId || !predicate || !statement) {
      return NextResponse.json({ error: "subjectEntityId, predicate and statement are required" }, { status: 400 });
    }
    if (!PRIVACY_LEVELS.has(privacyLevel)) return NextResponse.json({ error: "Invalid privacyLevel" }, { status: 400 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject } = await supabase
      .schema("personal_core")
      .from("entities")
      .select("id")
      .eq("id", subjectEntityId)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();
    if (!subject) return NextResponse.json({ error: "Subject not found for owner" }, { status: 404 });

    const result = await createConfirmedClaim(supabase, {
      ownerUserId,
      subjectEntityId,
      predicate,
      valueText: statement,
      claimType: typeof body.claimType === "string" ? body.claimType : "fact",
      confidence: typeof body.confidence === "number" ? body.confidence : 0.99,
      privacyLevel,
      sourceExcerpt: typeof body.sourceExcerpt === "string" ? body.sourceExcerpt : statement,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[Personal Intelligence Memory Confirm]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Memory confirmation failed" }, { status: 500 });
  }
}
