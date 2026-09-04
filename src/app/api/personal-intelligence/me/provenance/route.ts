import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";

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
      .select("id,display_name")
      .eq("owner_user_id", ownerUserId)
      .eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME)
      .single();

    if (subjectError || !subject?.id) {
      return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });
    }

    const { data: claims, error: claimsError } = await supabase
      .schema("personal_core")
      .from("claims")
      .select("id,predicate,value_text,claim_type,status,confidence,privacy_level,source_id,source_excerpt,confirmed_at,created_at,updated_at")
      .eq("owner_user_id", ownerUserId)
      .eq("subject_entity_id", subject.id)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (claimsError) throw new Error(claimsError.message);

    const sourceIds = Array.from(new Set((claims || []).map((claim) => claim.source_id).filter(Boolean).map(String)));
    let sources: Array<Record<string, unknown>> = [];
    if (sourceIds.length) {
      const { data, error } = await supabase
        .schema("personal_core")
        .from("sources")
        .select("id,source_type,source_name,source_system,reliability_class,privacy_level,source_date,captured_at,metadata")
        .eq("owner_user_id", ownerUserId)
        .in("id", sourceIds);
      if (error) throw new Error(error.message);
      sources = data || [];
    }

    const sourceById = new Map(sources.map((source) => [String(source.id), source]));
    const records = (claims || []).map((claim) => ({
      ...claim,
      source: claim.source_id ? sourceById.get(String(claim.source_id)) || null : null,
    }));

    return NextResponse.json({
      ok: true,
      subject,
      records,
      safety: {
        readOnly: true,
        writesPerformed: 0,
        ownerScoped: true,
        provenanceRequiredForCanonicalInterpretation: true,
      },
    });
  } catch (error) {
    console.error("[Personal Intelligence provenance]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Provenance review failed" }, { status: 500 });
  }
}
