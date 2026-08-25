import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase, createCampaignDraft } from "@/services/marketing/campaign-production";
import { isPilotChannel } from "@/lib/marketing/brand-registry";

export const dynamic = "force-dynamic";

function goalFor(sourceType: string) {
  if (sourceType === "property") return "leads" as const;
  if (sourceType === "book") return "sales" as const;
  if (sourceType === "demo_site") return "leads" as const;
  if (sourceType === "song") return "awareness" as const;
  return "awareness" as const;
}

function masterIdea(source: any) {
  const p = source.payload ?? {};
  if (source.source_type === "book") {
    return `Promote the book "${source.title}" under the Freddy Bremseth author brand. Drive readers to ${p.book_page_url || source.source_url}. Use the real cover/sample/series metadata available in the source. Do not invent reviews, sales rankings or claims.`;
  }
  if (source.source_type === "property") {
    return `Create a property campaign for ${source.title}. Use only the verified RealtyFlow property facts in the source payload. Goal: qualified property enquiry or viewing.`;
  }
  if (source.source_type === "demo_site") {
    return `Promote the ChatGenius.pro demo site "${source.title}" as an example for a small business that needs an affordable professional website. CTA: view demo or request a website. Verify features/pricing before making claims.`;
  }
  if (source.source_type === "song") {
    return `Promote the Re-Master Freddy song "${source.title}" using its verified song metadata and existing YouTube URL ${p.youtube_url || source.source_url || ""}. Goal: qualified YouTube views, subscribers and social follows. Use the existing artwork when available. Do not invent streaming numbers, chart positions, reviews or ownership claims.`;
  }
  if (source.brand_id === "donaanna") {
    return `Create Doña Anna content that sends relevant users to donaanna.com. Focus on olive oil, farm, harvest, origin, food use or Mediterranean agriculture. Avoid medical/health claims unless independently verified.`;
  }
  return `Create brand-safe content from the verified Nexus source "${source.title}". Use only source facts and send traffic to the canonical website where relevant.`;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const brandId = request.nextUrl.searchParams.get("brandId");
  const status = request.nextUrl.searchParams.get("status");
  let query = supabase.from("marketing_source_queue").select("id,brand_id,source_type,source_id,source_url,title,priority,recommended_channels,payload,status,blocked_reason,last_planned_at,updated_at").order("priority", { ascending: false }).limit(250);
  if (brandId) query = query.eq("brand_id", brandId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const summary = rows.reduce((acc: Record<string, number>, row: any) => {
    acc.total = (acc.total ?? 0) + 1;
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  return NextResponse.json({ summary, rows });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const sourceQueueId = String(body?.sourceQueueId ?? "").trim();
  const requestedChannel = String(body?.channel ?? "").trim().toLowerCase();
  if (!sourceQueueId) return NextResponse.json({ error: "sourceQueueId er påkrevd" }, { status: 400 });
  if (!["instagram", "facebook"].includes(requestedChannel)) return NextResponse.json({ error: "channel må være instagram eller facebook for denne kontrollerte draft-pathen" }, { status: 400 });

  const { data: source, error: sourceError } = await supabase.from("marketing_source_queue").select("*").eq("id", sourceQueueId).single();
  if (sourceError || !source) return NextResponse.json({ error: sourceError?.message || "Source not found" }, { status: 404 });
  if (!["ready", "pending"].includes(String(source.status))) return NextResponse.json({ error: `Source status ${source.status} kan ikke planlegges` }, { status: 409 });
  if (source.status === "blocked") return NextResponse.json({ error: source.blocked_reason || "Source blocked" }, { status: 409 });

  const recommended = Array.isArray(source.recommended_channels) ? source.recommended_channels.map(String) : [];
  if (!recommended.includes(requestedChannel)) return NextResponse.json({ error: `${requestedChannel} er ikke anbefalt for denne kilden` }, { status: 409 });
  if (!isPilotChannel(String(source.brand_id), requestedChannel)) {
    return NextResponse.json({
      error: `CHANNEL_NOT_PILOT_READY: ${source.brand_id}/${requestedChannel}`,
      note: "Nexus oppretter ikke kampanjeutkast gjennom Growth OS før kanalen er pilotklar og approval-gated."
    }, { status: 409 });
  }

  const { data: channelRows, error: channelError } = await supabase.from("social_channels").select("external_id,is_active").eq("brand_id", source.brand_id).eq("platform", requestedChannel).eq("is_active", true).limit(1);
  if (channelError) return NextResponse.json({ error: channelError.message }, { status: 500 });
  if (!channelRows?.length) return NextResponse.json({ error: `CHANNEL_NOT_CONNECTED: ${source.brand_id}/${requestedChannel}` }, { status: 409 });

  try {
    const mediaUrl = source.source_type === "book"
      ? source.payload?.cover_image_url || undefined
      : source.source_type === "property"
        ? source.payload?.primary_image || undefined
        : source.source_type === "song"
          ? source.payload?.thumbnail_url || source.payload?.image_url || undefined
          : undefined;

    const result = await createCampaignDraft(supabase, {
      brandId: String(source.brand_id),
      masterIdea: masterIdea(source),
      goal: { kind: goalFor(String(source.source_type)), target: 10, horizonDays: 30 },
      channel: requestedChannel as "instagram" | "facebook",
      language: source.payload?.language || undefined,
      mediaUrl,
      useInventoryProperty: source.source_type === "property",
      propertyId: source.source_type === "property" ? String(source.source_id) : undefined,
      focus: source.source_type === "property" ? source.payload?.location || undefined : undefined,
    });

    await supabase.from("marketing_source_queue").update({ status: "drafted", last_planned_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", source.id);
    return NextResponse.json({ ok: true, sourceQueueId, channel: requestedChannel, campaign: result, note: "Campaign draft opprettet. Dette er ikke det samme som publisert; approval/publisher lifecycle gjelder fortsatt." });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: message.startsWith("MISSING_") || message.includes("APPROVAL") ? 409 : 500 });
  }
}
