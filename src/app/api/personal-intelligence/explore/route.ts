import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { buildPersonalContextPack } from "@/lib/personal-intelligence/context-router";
import { generateExploreSuggestions } from "@/lib/personal-intelligence/explore-service";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase, PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME } from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });

    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);
    const { data: subject } = await supabase.schema("personal_core").from("entities")
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .eq("entity_type", "person")
      .eq("canonical_name", PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME)
      .single();
    if (!subject?.id) return NextResponse.json({ error: "Personal Intelligence owner is not bootstrapped" }, { status: 409 });

    const context = await buildPersonalContextPack(supabase, {
      ownerUserId,
      subjectEntityId: String(subject.id),
      sessionScope: "internal",
      explicitSensitivePermission: false,
      includeGoals: true,
      limit: 30,
    });

    const [topicsResult, domainsResult] = await Promise.all([
      supabase.schema("knowledge").from("topics").select("id,name,domain_id").eq("owner_user_id", ownerUserId).limit(50),
      supabase.schema("knowledge").from("domains").select("id,name").eq("owner_user_id", ownerUserId).limit(50),
    ]);
    if (topicsResult.error) throw new Error(topicsResult.error.message);
    if (domainsResult.error) throw new Error(domainsResult.error.message);
    const domains = new Map((domainsResult.data || []).map((domain) => [String(domain.id), String(domain.name)]));
    const topics = (topicsResult.data || []).map((topic) => ({ name: String(topic.name), domainName: domains.get(String(topic.domain_id)) || null }));

    const result = await generateExploreSuggestions({ context, topics });
    return NextResponse.json({
      ok: true,
      ...result,
      evidenceSummary: { claims: context.claims.length, goals: context.goals.length, topics: topics.length },
      safety: { readOnly: true, persistAsPersonalMemory: false, outboundActions: false, sensitivePermission: false },
      writesPerformed: 0,
    });
  } catch (error) {
    console.error("[Personal Intelligence Explore]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Explore failed" }, { status: 500 });
  }
}
