import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildChatGeniusServiceUpsertPayload,
  getChatGeniusServiceCatalog,
  mergeChatGeniusServiceSets,
  normalizeChatGeniusServiceRow,
  sortChatGeniusServices,
  summarizeChatGeniusServices,
  type ChatGeniusService,
} from "@/lib/chatgenius-services";
import { getSaasSupabase } from "@/lib/saas-api-supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE_MISSING_CODES = new Set(["42P01", "PGRST106", "PGRST205"]);
const DEFAULT_MANIFEST_URL = "https://www.chatgenius.pro/data/services.json";

type ManifestServiceInput = Partial<ChatGeniusService> & Record<string, unknown>;

type ManifestLoadResult = {
  services: ManifestServiceInput[];
  url: string | null;
  warning?: string | null;
};

function joinWarnings(...warnings: Array<string | null | undefined>) {
  return warnings.filter(Boolean).join(" ");
}

function getManifestServices(payload: unknown): ManifestServiceInput[] {
  const manifest = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const services = Array.isArray(payload) ? payload : manifest.services;
  if (!Array.isArray(services)) return [];
  return services.filter((service): service is ManifestServiceInput => Boolean(service && typeof service === "object"));
}

async function loadChatGeniusManifest(): Promise<ManifestLoadResult> {
  const url = process.env.CHATGENIUS_SERVICES_MANIFEST_URL || DEFAULT_MANIFEST_URL;
  if (!url || url === "disabled") return { services: [], url: null };

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      return {
        services: [],
        url,
        warning: `Kunne ikke hente ChatGenius-manifestet (${response.status}). Viser lagrede tjenester.`,
      };
    }

    const payload = await response.json();
    return { services: getManifestServices(payload), url };
  } catch (error) {
    console.warn("[ChatGenius services] manifest fetch failed", error);
    return {
      services: [],
      url,
      warning: "Kunne ikke hente ChatGenius-manifestet akkurat nå. Viser lagrede tjenester.",
    };
  }
}

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

  const manifest = await loadChatGeniusManifest();
  const supabase = getSaasSupabase();
  if (!supabase) {
    const services = manifest.services.length
      ? mergeChatGeniusServiceSets(getChatGeniusServiceCatalog(), manifest.services)
      : getChatGeniusServiceCatalog();
    return NextResponse.json({
      services,
      summary: summarizeChatGeniusServices(services),
      source: manifest.services.length ? "fallback+chatgenius-manifest" : "fallback",
      warning: joinWarnings("Supabase er ikke konfigurert. Viser katalogen fra koden.", manifest.warning),
      manifest: { url: manifest.url, services: manifest.services.length },
    });
  }

  const { data, error } = await supabase
    .from("chatgenius_services")
    .select("*")
    .eq("brand_id", "chatgenius")
    .order("priority", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      const services = manifest.services.length
        ? mergeChatGeniusServiceSets(getChatGeniusServiceCatalog(), manifest.services)
        : getChatGeniusServiceCatalog();
      return NextResponse.json(
        {
          services,
          summary: summarizeChatGeniusServices(services),
          source: manifest.services.length ? "fallback+chatgenius-manifest" : "fallback",
          warning: joinWarnings("Tabellen chatgenius_services finnes ikke ennå. Kjør Supabase-migrasjonen og synk katalogen.", manifest.warning),
          manifest: { url: manifest.url, services: manifest.services.length },
        },
      );
    }

    console.error("[ChatGenius services] GET failed", error);
    const services = manifest.services.length
      ? mergeChatGeniusServiceSets(getChatGeniusServiceCatalog(), manifest.services)
      : getChatGeniusServiceCatalog();
    return NextResponse.json(
      {
        services,
        summary: summarizeChatGeniusServices(services),
        source: manifest.services.length ? "fallback+chatgenius-manifest" : "fallback",
        warning: manifest.warning,
        manifest: { url: manifest.url, services: manifest.services.length },
        error: error.message,
      },
      { status: 500 },
    );
  }

  const storedServices = data?.length
    ? sortChatGeniusServices(data.map((row: Record<string, unknown>) => normalizeChatGeniusServiceRow(row)))
    : getChatGeniusServiceCatalog();
  const manifestServices = manifest.services.length
    ? mergeChatGeniusServiceSets(getChatGeniusServiceCatalog(), manifest.services)
    : getChatGeniusServiceCatalog();
  const services = data?.length ? mergeChatGeniusServiceSets(manifestServices, storedServices) : manifestServices;

  return NextResponse.json({
    services,
    summary: summarizeChatGeniusServices(services),
    source: `${data?.length ? "supabase" : "fallback"}${manifest.services.length ? "+chatgenius-manifest" : ""}`,
    warning: joinWarnings(data?.length ? null : "Ingen tjenester er lagret i Supabase ennå. Viser katalogen fra koden.", manifest.warning),
    manifest: { url: manifest.url, services: manifest.services.length },
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

  if (!["sync_seed", "sync_remote", "upsert"].includes(action)) {
    return NextResponse.json({ error: "Ukjent ChatGenius service-handling." }, { status: 400 });
  }

  let services: ChatGeniusService[];

  if (action === "upsert") {
    services = [normalizeChatGeniusServiceRow(body.service || body)];
  } else {
    const manifest = await loadChatGeniusManifest();
    if (action === "sync_remote" && !manifest.services.length) {
      return NextResponse.json(
        { error: manifest.warning || "Fant ingen tjenester i ChatGenius-manifestet.", manifest: { url: manifest.url, services: 0 } },
        { status: 502 },
      );
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("chatgenius_services")
      .select("*")
      .eq("brand_id", "chatgenius");

    if (existingError && !isMissingTableError(existingError)) {
      console.warn("[ChatGenius services] Could not load existing services before sync", existingError);
    }

    const baseServices = existingRows?.length
      ? sortChatGeniusServices(existingRows.map((row: Record<string, unknown>) => normalizeChatGeniusServiceRow(row)))
      : getChatGeniusServiceCatalog();
    const bootstrapServices = manifest.services.length
      ? mergeChatGeniusServiceSets(getChatGeniusServiceCatalog(), manifest.services)
      : getChatGeniusServiceCatalog();
    services = existingRows?.length ? mergeChatGeniusServiceSets(bootstrapServices, baseServices) : bootstrapServices;
  }

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
