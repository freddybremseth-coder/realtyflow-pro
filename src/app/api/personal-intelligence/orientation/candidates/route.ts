import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { extractMemoryCandidates } from "@/lib/personal-intelligence/memory-extractor";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OrientationAnswer = { questionId?: unknown; answer?: unknown };

const ALLOWED_TYPES = new Set(["fact", "goal", "preference", "belief", "interest"]);

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") {
      return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { answers?: OrientationAnswer[] };
    const answers = Array.isArray(body.answers) ? body.answers.slice(0, 12) : [];
    const normalized = answers
      .map((item) => ({
        questionId: typeof item.questionId === "string" ? item.questionId.trim().slice(0, 80) : "",
        answer: typeof item.answer === "string" ? item.answer.trim().slice(0, 2000) : "",
      }))
      .filter((item) => item.questionId && item.answer);

    if (!normalized.length) {
      return NextResponse.json({ error: "At least one answered orientation question is required" }, { status: 400 });
    }

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject } = await supabase
      .schema("personal_core")
      .from("entities")
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME)
      .single();
    if (!subject?.id) {
      return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });
    }

    const extracted = await Promise.all(normalized.map(async (item) => {
      const candidates = await extractMemoryCandidates(item.answer);
      return candidates
        .filter((candidate) => ALLOWED_TYPES.has(candidate.type))
        .slice(0, 6)
        .map((candidate, index) => ({
          ...candidate,
          id: `${item.questionId}:${index}`,
          persistence: "CONFIRM" as const,
          sourceQuestionId: item.questionId,
          sourceExcerpt: item.answer,
        }));
    }));

    return NextResponse.json({
      ok: true,
      subjectEntityId: subject.id,
      candidates: extracted.flat().slice(0, 20),
      writesPerformed: 0,
    });
  } catch (error) {
    console.error("[Personal Intelligence Orientation Candidates]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Orientation extraction failed" }, { status: 500 });
  }
}
