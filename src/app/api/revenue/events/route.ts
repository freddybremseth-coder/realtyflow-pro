import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  isRevenueEventType,
  insertRevenueEvent,
  normalizeRevenueEvent,
  summarizeRevenueEvents,
  type RevenueEventInput,
} from "@/lib/revenue/events";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function tableMissing(message?: string) {
  return /revenue_events|schema cache|does not exist|relation/i.test(String(message || ""));
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, {
    events: [],
    summary: summarizeRevenueEvents([]),
    tableNotReady: true,
  });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { events: [], summary: summarizeRevenueEvents([]), error: "Supabase not configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");
  const brandId = searchParams.get("brandId");
  const eventType = searchParams.get("eventType");
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));

  let query = supabase
    .from("revenue_events")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (contactId) query = query.eq("contact_id", contactId);
  if (brandId) query = query.eq("brand_id", brandId);
  if (eventType && isRevenueEventType(eventType)) query = query.eq("event_type", eventType);

  const { data, error } = await query;
  if (error) {
    if (tableMissing(error.message)) {
      return NextResponse.json({
        events: [],
        summary: summarizeRevenueEvents([]),
        tableNotReady: true,
        error: error.message,
      });
    }
    return NextResponse.json({ events: [], summary: summarizeRevenueEvents([]), error: error.message }, { status: 500 });
  }

  const events = data || [];
  return NextResponse.json({ events, summary: summarizeRevenueEvents(events) });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Partial<RevenueEventInput>;

  try {
    const input = {
      eventType: body.eventType as RevenueEventInput["eventType"],
      title: body.title,
      description: body.description,
      contactId: body.contactId,
      brandId: body.brandId,
      sourceSystem: body.sourceSystem,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      actorType: body.actorType,
      actorId: body.actorId,
      confidenceScore: body.confidenceScore,
      revenueImpactEur: body.revenueImpactEur,
      occurredAt: body.occurredAt,
      dedupeKey: body.dedupeKey,
      metadata: body.metadata,
      createdBy: body.createdBy,
    } satisfies RevenueEventInput;

    // Validate early so bad client payloads still return 400.
    normalizeRevenueEvent(input);
    const result = await insertRevenueEvent(supabase, input);

    if (!result.ok) {
      if (result.tableNotReady || tableMissing(result.error)) {
        return NextResponse.json({ error: result.error, tableNotReady: true }, { status: 503 });
      }
      return NextResponse.json({ error: result.error || "Could not create revenue event" }, { status: 500 });
    }

    return NextResponse.json({ event: result.event, duplicate: Boolean(result.duplicate) }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create revenue event" },
      { status: 400 },
    );
  }
}
