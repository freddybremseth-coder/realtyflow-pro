import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase } from "@/lib/personal-intelligence/supabase";
import { runMentorTurn } from "@/lib/personal-intelligence/mentor-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") {
      return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const reflection = typeof body.reflection === "string" ? body.reflection.trim() : "";
    const subjectEntityId = typeof body.subjectEntityId === "string" ? body.subjectEntityId.trim() : "";
    const privacyScope = body.privacyScope === "internal" ? "internal" : "private";

    if (!reflection) return NextResponse.json({ error: "reflection is required" }, { status: 400 });
    if (!subjectEntityId) return NextResponse.json({ error: "subjectEntityId is required" }, { status: 400 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const result = await runMentorTurn(supabase, {
      ownerUserId,
      subjectEntityId,
      message: reflection,
      privacyScope,
      thinkDeeper: body.thinkDeeper === true,
      sessionType: "reflection",
      primaryMode: "mentor",
      inputMode: "reflection",
      persistMessages: false,
      reflectionMode: true,
    });

    return NextResponse.json({
      ...result,
      retention: {
        rawReflectionStoredInMessages: false,
        mentorResponseStoredInMessages: false,
        memoryCandidatesPersistedAutomatically: false,
      },
    });
  } catch (error) {
    console.error("[Personal Intelligence Reflection]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reflection failed" },
      { status: 500 },
    );
  }
}
