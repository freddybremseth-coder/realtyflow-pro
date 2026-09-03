import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import {
  getPersonalIntelligenceOwnerUserId,
  getPersonalIntelligenceSupabase,
  PERSONAL_INTELLIGENCE_OWNER_CANONICAL_NAME,
} from "@/lib/personal-intelligence/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function ownerSubject() {
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
  if (error || !subject?.id) throw new Error("Personal Intelligence owner is not bootstrapped");
  return { supabase, ownerUserId, subjectEntityId: subject.id as string };
}

export async function GET(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const { supabase, ownerUserId, subjectEntityId } = await ownerSubject();

    const [{ data: domains, error: domainsError }, { data: topics, error: topicsError }, { data: mastery, error: masteryError }] = await Promise.all([
      supabase.schema("knowledge").from("domains").select("id,name,description,created_at").eq("owner_user_id", ownerUserId).order("name"),
      supabase.schema("knowledge").from("topics").select("id,domain_id,parent_topic_id,name,description,difficulty_band,metadata,created_at").eq("owner_user_id", ownerUserId).order("name"),
      supabase.schema("knowledge").from("mastery").select("topic_id,exposure_score,understanding_score,retention_score,transfer_score,formal_exposure_score,practical_exposure_score,interest_score,evidence_strength,last_assessed_at,next_review_at").eq("owner_user_id", ownerUserId).eq("subject_entity_id", subjectEntityId),
    ]);
    if (domainsError) throw domainsError;
    if (topicsError) throw topicsError;
    if (masteryError) throw masteryError;

    const masteryByTopic = new Map((mastery || []).map((row) => [row.topic_id, row]));
    return NextResponse.json({
      ok: true,
      domains: domains || [],
      topics: (topics || []).map((topic) => ({ ...topic, mastery: masteryByTopic.get(topic.id) || null })),
      semantics: { missingMasteryMeans: "unknown", topicPresenceMeans: "mapped_interest_or_learning_area_not_mastery" },
    });
  } catch (error) {
    console.error("[Personal Intelligence Knowledge Map GET]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Knowledge map failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const domainName = typeof body.domainName === "string" ? body.domainName.trim().slice(0, 120) : "";
    const topicName = typeof body.topicName === "string" ? body.topicName.trim().slice(0, 160) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
    const sourceExcerpt = typeof body.sourceExcerpt === "string" ? body.sourceExcerpt.trim().slice(0, 2000) : topicName;
    if (!domainName || !topicName) return NextResponse.json({ error: "domainName and topicName are required" }, { status: 400 });

    const { supabase, ownerUserId } = await ownerSubject();
    let { data: domain, error: domainError } = await supabase.schema("knowledge").from("domains")
      .select("id,name").eq("owner_user_id", ownerUserId).eq("name", domainName).maybeSingle();
    if (domainError) throw domainError;
    if (!domain) {
      const inserted = await supabase.schema("knowledge").from("domains").insert({ owner_user_id: ownerUserId, name: domainName, description: "Owner-confirmed knowledge map domain" }).select("id,name").single();
      if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || "Knowledge domain insert failed");
      domain = inserted.data;
    }

    const existing = await supabase.schema("knowledge").from("topics").select("id,domain_id,name,metadata")
      .eq("owner_user_id", ownerUserId).eq("domain_id", domain.id).eq("name", topicName).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return NextResponse.json({ ok: true, created: false, domain, topic: existing.data, masteryCreated: false });

    const { data: topic, error: topicError } = await supabase.schema("knowledge").from("topics").insert({
      owner_user_id: ownerUserId,
      domain_id: domain.id,
      name: topicName,
      description: description || null,
      metadata: {
        origin: "owner_confirmed_knowledge_discovery",
        source_type: "direct_user_statement",
        source_excerpt: sourceExcerpt,
        confirmed_at: new Date().toISOString(),
        mastery_semantics: "topic mapping does not imply mastery",
      },
    }).select("id,domain_id,name,description,metadata,created_at").single();
    if (topicError || !topic) throw new Error(topicError?.message || "Knowledge topic insert failed");

    return NextResponse.json({ ok: true, created: true, domain, topic, masteryCreated: false });
  } catch (error) {
    console.error("[Personal Intelligence Knowledge Map POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Knowledge map write failed" }, { status: 500 });
  }
}
