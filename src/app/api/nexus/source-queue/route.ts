import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase, createCampaignDraft } from "@/services/marketing/campaign-production";
import { isMetaGrowthChannel, isPilotChannel } from "@/lib/marketing/brand-registry";

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
  if (source.brand_id === "freddyb" && source.source_type === "creative_spotlight") {
    const kind = p.source_type === "artwork" ? "et originalt kunstverk"
      : p.source_type === "song" ? "en låt fra Re-Master Freddy"
      : "en utgitt bok fra forfatterskapet mitt";
    return [
      "Lag ett kort, varmt og konkret Facebook-innlegg skrevet i jeg-form for FREDDY BREMSETH sin offentlige samleside.",
      "Freddy deler et UTVALGT prosjekt med egen introduksjon, ikke en identisk kopi av et Instagram-innlegg.",
      `Verifisert prosjekt: ${kind}. Verifisert tittel: "${source.title.replace(/^Freddy story:\s*/, "")}".`,
      `Kilde: ${source.source_url}.`,
      `Godkjent faktabeskrivelse: ${p.suggested_copy || ""}`,
      "Skriv 2–4 korte setninger som forteller hva publikum ser og hvor de finner prosjektet.",
      "Bruk kun verifiserte kildedata. Ikke finn på en bakgrunnshistorie, motivasjon, skapelsesår, pris eller suksess.",
      "Ikke antyd at Facebook har en automatisk kopi av Instagram-Reelen. Avslutt med den eksakte, verifiserte kildelenken.",
      "Dette skal være et forslag til eierens godkjenning; publiser ALDRI automatisk."
    ].join("\n");
  }
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
  if (!isMetaGrowthChannel(requestedChannel)) {
    return NextResponse.json({
      error: "CHANNEL_PUBLISHER_NOT_READY",
      note: "Denne kontrollerte draft-pathen støtter foreløpig Instagram og Facebook. YouTube, LinkedIn, website og email må ha egen brand-scopet approval-publisher før de kan kjøres her.",
    }, { status: 409 });
  }

  const { data: source, error: sourceError } = await supabase.from("marketing_source_queue").select("*").eq("id", sourceQueueId).single();
  if (sourceError || !source) return NextResponse.json({ error: sourceError?.message || "Source not found" }, { status: 404 });
  if (!["ready", "pending"].includes(String(source.status))) return NextResponse.json({ error: `Source status ${source.status} kan ikke planlegges` }, { status: 409 });
  const isUmbrellaStory = source.brand_id === "freddyb" && source.source_type === "creative_spotlight";
  if (isUmbrellaStory) {
    if (requestedChannel !== "facebook" || source.status !== "ready" || source.payload?.publishing_policy !== "approval_required_rewrite_no_identical_crosspost") {
      return NextResponse.json({ error: "FREDDY_UMBRELLA_EDITORIAL_POLICY_MISMATCH" }, { status: 409 });
    }
    const kind = String(source.payload?.source_type || "");
    const key = String(source.source_id || "");
    if (!["artwork", "song", "book"].includes(kind) || !key.startsWith(`${kind === "artwork" ? "art" : kind === "song" ? "music" : "book"}:`)) {
      return NextResponse.json({ error: "FREDDY_EDITORIAL_SOURCE_INVALID" }, { status: 409 });
    }
    const id = key.slice(key.indexOf(":") + 1);
    if (!id || !String(source.source_url || "").startsWith(kind === "artwork" ? "https://art.freddybremseth.com/verk/" : kind === "book" ? "https://books.freddybremseth.com/book/" : "https://www.youtube.com/watch?v=")) {
      return NextResponse.json({ error: "FREDDY_EDITORIAL_LINK_NOT_VERIFIED" }, { status: 409 });
    }
    if (kind === "artwork") {
      const { data: work, error: workError } = await supabase.from("art_gallery_works").select("id,published,public_preview_path").eq("id", id).maybeSingle();
      if (workError || !work?.published || !/^[a-z0-9][a-z0-9-]{0,120}\/view\.webp$/.test(String(work.public_preview_path))) {
        return NextResponse.json({ error: "FREDDY_EDITORIAL_ART_NOT_PUBLIC" }, { status: 409 });
      }
    } else if (kind === "book") {
      const { data: book, error: bookError } = await supabase.from("book_titles").select("status").eq("id", id).maybeSingle();
      if (bookError || book?.status !== "published") return NextResponse.json({ error: "FREDDY_EDITORIAL_BOOK_NOT_PUBLISHED" }, { status: 409 });
    } else {
      const { data: song, error: songError } = await supabase.from("songs").select("brand,youtube_url,file_url").eq("id", id).maybeSingle();
      if (songError || song?.brand !== "remasterfreddy" || song?.youtube_url !== source.source_url || !song.file_url) {
        return NextResponse.json({ error: "FREDDY_EDITORIAL_MUSIC_NOT_VERIFIED" }, { status: 409 });
      }
    }
    const { data: plan, error: planError } = await supabase.from("marketing_brand_growth_plans")
      .select("status,autonomy_mode").eq("brand_id", "freddyb").maybeSingle();
    if (planError || plan?.status !== "active" || plan?.autonomy_mode !== "approval_required") {
      return NextResponse.json({ error: "FREDDY_EDITORIAL_APPROVAL_REQUIRED" }, { status: 409 });
    }
  }
  if (source.status === "blocked") return NextResponse.json({ error: source.blocked_reason || "Source blocked" }, { status: 409 });

  const recommended = Array.isArray(source.recommended_channels) ? source.recommended_channels.map(String) : [];
  if (!recommended.includes(requestedChannel)) return NextResponse.json({ error: `${requestedChannel} er ikke anbefalt for denne kilden` }, { status: 409 });
  if (!isPilotChannel(String(source.brand_id), requestedChannel)) {
    return NextResponse.json({
      error: `CHANNEL_NOT_PILOT_READY: ${source.brand_id}/${requestedChannel}`,
      note: "Nexus oppretter ikke kampanjeutkast gjennom Growth OS før kanalen er pilotklar og approval-gated."
    }, { status: 409 });
  }

  const { data: channelRows, error: channelError } = await supabase.from("social_channels").select("external_id,is_active").eq("brand_id", source.brand_id).eq("platform", requestedChannel).eq("is_active", true).limit(isUmbrellaStory ? 3 : 1);
  if (channelError) return NextResponse.json({ error: channelError.message }, { status: 500 });
  if (!channelRows?.length) return NextResponse.json({ error: `CHANNEL_NOT_CONNECTED: ${source.brand_id}/${requestedChannel}` }, { status: 409 });
  if (source.brand_id === "freddyb" && requestedChannel === "facebook") {
    if (!isUmbrellaStory || channelRows.length !== 1 || channelRows[0].external_id !== "1324025764122967") {
      return NextResponse.json({ error: "FREDDY_PUBLIC_FACEBOOK_EDITORIAL_ONLY: bare utvalgte historier på den offentlige Freddy Bremseth-siden kan bli utkast" }, { status: 409 });
    }
  }

  try {
    const mediaUrl = isUmbrellaStory
      ? source.payload?.source_type === "artwork" && typeof source.payload?.approved_art_preview === "string"
        && source.payload.approved_art_preview.startsWith("https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/")
        ? source.payload.approved_art_preview
        : undefined
      : source.source_type === "book"
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
      channel: requestedChannel,
      language: source.payload?.language || undefined,
      mediaUrl,
      reuseCooldownDays: isUmbrellaStory ? 14 : undefined,
      requirePublicationHistory: isUmbrellaStory,
      useInventoryProperty: source.source_type === "property",
      propertyId: source.source_type === "property" ? String(source.source_id) : undefined,
      focus: source.source_type === "property" ? source.payload?.location || undefined : undefined,
    });

    if (isUmbrellaStory && result.results.some((row) => row.mode !== "manual-review" || !row.approvalId)) {
      return NextResponse.json({
        error: "FREDDY_EDITORIAL_MANUAL_REVIEW_NOT_CREATED",
        results: result.results.map((row) => ({ state: row.state, mode: row.mode, error: row.error ?? null })),
        note: "Kilden ble ikke markert som planlagt. RealtyFlow skal aldri sende slike personlige historier uten eksplisitt godkjenning.",
      }, { status: 409 });
    }
    const { error: markError } = await supabase.from("marketing_source_queue").update({ status: "drafted", last_planned_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", source.id).eq("status", source.status);
    if (markError) throw new Error(`SOURCE_DRAFT_MARK_FAILED: ${markError.message}`);

    const primary = result.results.find((row) => row.approvalId) ?? result.results[0] ?? null;
    const approvalId = primary?.approvalId ?? null;
    const publicationId = primary?.publicationId && primary.publicationId !== "-" ? primary.publicationId : null;
    const approvalHref = approvalId ? `/approvals#agentic-approval-${approvalId}` : "/approvals";

    return NextResponse.json({
      ok: true,
      sourceQueueId,
      channel: requestedChannel,
      campaign: result,
      workflow: {
        state: approvalId ? "awaiting_approval" : "draft_created",
        approvalId,
        publicationId,
        approvalHref,
        campaignId: result.campaignId,
        marketingRunId: result.marketingRunId,
      },
      note: approvalId
        ? "Kampanjestart opprettet og venter på godkjenning. Dette er ikke publisert ennå."
        : "Kampanjedraft opprettet. Ingen konkret approval-ID ble returnert; åpne Kontroll for status."
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: message.startsWith("MISSING_") || message.includes("APPROVAL") ? 409 : 500 });
  }
}
