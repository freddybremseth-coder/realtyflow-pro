import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildChatGeniusServiceUpsertPayload,
  getChatGeniusServiceCatalog,
  normalizeChatGeniusServiceRow,
  sortChatGeniusServices,
  summarizeChatGeniusServices,
  type ChatGeniusService,
} from "@/lib/chatgenius-services";
import { getSaasSupabase } from "@/lib/saas-api-supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE_MISSING_CODES = new Set(["42P01", "PGRST106", "PGRST205"]);

function fallbackResponse(source: string, warning?: string) {
  const services = getChatGeniusServiceCatalog();
  return {
    services,
    summary: summarizeChatGeniusServices(services),
    source,
    warning,
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  return Boolean(error.code && TABLE_MISSING_CODES.has(error.code)) || message.includes("chatgenius_services") || message.includes("schema cache");
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, fallbackResponse("fallback"));
  if (unauthorized) return unauthorized;

  const supabase = getSaasSupabase();
  if (!supabase) {
    return NextResponse.json(fallbackResponse("fallback", "Supabase er ikke konfigurert. Viser katalogen fra koden."));
  }

  const { data, error } = await supabase
    .from("chatgenius_services")
    .select("*")
    .eq("brand_id", "chatgenius")
    .order("priority", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        fallbackResponse("fallback", "Tabellen chatgenius_services finnes ikke ennå. Kjør Supabase-migrasjonen og synk katalogen."),
      );
    }

    console.error("[ChatGenius services] GET failed", error);
    return NextResponse.json({ ...fallbackResponse("fallback"), error: error.message }, { status: 500 });
  }

  const services = data?.length
    ? sortChatGeniusServices(data.map((row: Record<string, unknown>) => normalizeChatGeniusServiceRow(row)))
    : getChatGeniusServiceCatalog();

  return NextResponse.json({
    services,
    summary: summarizeChatGeniusServices(services),
    source: data?.length ? "supabase" : "fallback",
    warning: data?.length ? null : "Ingen tjenester er lagret i Supabase ennå. Viser katalogen fra koden.",
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSaasSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "sync_seed");

  if (!["sync_seed", "upsert"].includes(action)) {
    return NextResponse.json({ error: "Ukjent ChatGenius service-handling." }, { status: 400 });
  }

  const services: ChatGeniusService[] = action === "upsert"
    ? [normalizeChatGeniusServiceRow(body.service || body)]
    : getChatGeniusServiceCatalog();

  if (services.some((service) => !service.slug || !service.name)) {
    return NextResponse.json({ error: "slug og name må være satt for alle tjenester." }, { status: 400 });
  }

  const payload = services.map(buildChatGeniusServiceUpsertPayload);
  const { data, error } = await supabase
    .from("chatgenius_services")
    .upsert(payload, { onConflict: "slug" })
    .select("*");

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "Tabellen chatgenius_services finnes ikke. Kjør migrasjonen 20260820141351_chatgenius_service_catalog.sql først." },
        { status: 500 },
      );
    }

    console.error("[ChatGenius services] POST failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const normalized = sortChatGeniusServices((data || []).map((row: Record<string, unknown>) => normalizeChatGeniusServiceRow(row)));
  return NextResponse.json({
    ok: true,
    action,
    services: normalized,
    summary: summarizeChatGeniusServices(normalized),
    source: "supabase",
  });
}
