import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { createCampaignDraft, getServiceSupabase, type CreateCampaignDraftInput } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MANUAL_REVIEW_REGENERATION_ATTEMPTS = 3;
const RECOVERABLE_COPY_ERROR_PREFIXES = [
  "FACT_NOT_VERIFIED",
  "CLAIM_NOT_VERIFIED",
  "BRAND_ROLE_MISMATCH",
  "CHANNEL_FORMAT_MISMATCH",
] as const;

type CampaignDraftRequest = Partial<CreateCampaignDraftInput> & {
  /**
   * Safety contract for Canary/manual-review callers. The route refuses to run
   * when the requested channel is already preapproved for controlled-auto.
   * This prevents a button labelled "Create Draft" from silently publishing.
   */
  forceManualReview?: boolean;
};

function configuredAutopilotChannels(metadata: Record<string, unknown> | null | undefined): Set<string> {
  const raw = metadata?.autopilot_channels ?? metadata?.autopilot_scope;
  const values = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : [];
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function isRecoverableCopyError(error: string | null | undefined): boolean {
  if (!error) return false;
  // Some generator failures wrap the deterministic gate error, e.g.
  // "CREATIVE_OUTPUT_INVALID: CHANNEL_FORMAT_MISMATCH ...". Match the embedded
  // gate code as well as a direct prefix so manual-review can regenerate safely.
  return RECOVERABLE_COPY_ERROR_PREFIXES.some((prefix) => error.includes(prefix));
}

function manualReviewRetryMasterIdea(masterIdea: string, attempt: number, previousErrors: string): string {
  return [
    masterIdea,
    "",
    `MANUAL-REVIEW REGENERATION ${attempt}: Forrige AI-variant ble stoppet av en sikkerhets-/kvalitetsgate.`,
    previousErrors && `Forrige gate-feil: ${previousErrors}`,
    "Lag en vesentlig ny Facebook-vinkel, men behold samme verifiserte Inventory-bolig og de samme faktakravene.",
    "Ikke åpne med eller parafraser «Drømmer du om et hjem i solen?» eller andre generiske drømmehjem-åpninger.",
    "Start heller med ett konkret, verifisert trekk ved boligen eller stedet.",
    "Zen Eco Homes er rådgiver/formidler: skriv aldri «vår/våre» foran bolig, villa, eiendom eller leilighet — heller ikke med adjektiv imellom, som «vår moderne villa».",
    "Ikke legg til subjektiv pynt som «vakkert område», «fantastisk bolig», «hever standarden», «perfekt» eller tilsvarende dersom det ikke er eksplisitt og uavhengig dokumentert. Foretrekk nøkterne fakta.",
    "Ikke fyll sparse Inventory-fakta med «sjarmerende», «praktisk/komfortabel livsstil», «område kjent for», «mildt klima», «vakre landskap», «bærekraft», ferie-/helårsbolig-egnethet eller løfter om trygghet/komfort. Alt slikt krever eksplisitt factSource.",
    "Hvis faktakilden bare sier energimerking, gjengi bare energimerkingen. Ikke koble energimerket til bærekraft, trygghet, kvalitet, komfort, besparelse eller andre følger.",
    "Når factSources er sparsomme, skriv kortere: 2–4 kompakte faktasetninger er bedre enn kreativ utfylling.",
    "BODY skal ikke inneholde URL-er eller Markdown-lenker. Systemet legger inn den verifiserte bolig-/kontakt-CTA-en automatisk; ikke gjenta den i body.",
    "Ikke finn på fakta, ikke legg til superlativer og ikke svekk kildekravene.",
  ].filter(Boolean).join("\n");
}

/** Phase 7.1B — create campaign content. Canary callers can enforce a fail-closed manual-review contract. */
export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  await getRequestAccessContext(request);

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as CampaignDraftRequest;
  if (!body.brandId || !body.masterIdea || !body.goal?.kind) {
    return NextResponse.json({ error: "brandId, masterIdea og goal.kind er påkrevd" }, { status: 400 });
  }

  // A Canary/manual-review action must never inherit a channel that has already
  // been enabled for controlled-auto. Refuse BEFORE createCampaignDraft so there
  // is no possibility of a hidden live side effect.
  if (body.forceManualReview === true) {
    if (!body.channel) {
      return NextResponse.json({ error: "MANUAL_REVIEW_CHANNEL_REQUIRED" }, { status: 400 });
    }
    const { data: plan, error: planError } = await supabase
      .from("marketing_brand_growth_plans")
      .select("status,autonomy_mode,metadata")
      .eq("brand_id", body.brandId)
      .maybeSingle();
    if (planError) {
      return NextResponse.json({ error: `MANUAL_REVIEW_POLICY_CHECK_FAILED: ${planError.message}` }, { status: 503 });
    }
    const liveChannels = configuredAutopilotChannels((plan?.metadata ?? {}) as Record<string, unknown>);
    const channelAlreadyLive = plan?.status === "active"
      && plan?.autonomy_mode === "controlled_auto"
      && liveChannels.has(String(body.channel).toLowerCase());
    if (channelAlreadyLive) {
      return NextResponse.json({
        error: `MANUAL_REVIEW_CHANNEL_ALREADY_LIVE: ${body.brandId}/${body.channel} er aktivert for controlled-auto. Canary må være pending/manual-review før utkast kan lages.`,
      }, { status: 409 });
    }
  }

  try {
    let res: Awaited<ReturnType<typeof createCampaignDraft>> | null = null;
    let previousErrors = "";

    const maxAttempts = body.forceManualReview === true ? MAX_MANUAL_REVIEW_REGENERATION_ATTEMPTS : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const masterIdea = attempt === 1 ? body.masterIdea : manualReviewRetryMasterIdea(body.masterIdea, attempt, previousErrors);
      res = await createCampaignDraft(supabase, {
        brandId: body.brandId,
        masterIdea,
        goal: { kind: body.goal.kind, target: body.goal.target ?? 10, horizonDays: body.goal.horizonDays ?? 30 },
        focus: body.focus,
        service: body.service,
        market: body.market,
        language: body.language,
        publishingAccountId: body.publishingAccountId,
        publishingCapacityPerWeek: body.publishingCapacityPerWeek,
        legacyPublicationId: body.legacyPublicationId,
        channel: body.channel,
        mediaUrl: body.mediaUrl,
        useInventoryProperty: body.useInventoryProperty,
        propertyId: body.propertyId,
      });

      if (body.forceManualReview !== true) break;
      const recoverable = res.results.filter((item) =>
        item.state === "regenerate"
        || ((item.mode === "blocked" || item.state === "rejected") && isRecoverableCopyError(item.error)),
      );
      if (!recoverable.length) break;
      previousErrors = recoverable.map((item) => item.error ?? `state=${item.state}`).join(" | ");
    }

    if (!res) throw new Error("CAMPAIGN_DRAFT_EMPTY_RESULT");

    if (body.forceManualReview === true) {
      const unexpected = res.results.find((item) => item.mode !== "manual-review");
      if (unexpected) {
        const detail = unexpected.error ? ` — ${unexpected.error}` : "";
        const code = unexpected.state === "regenerate"
          ? "NOVELTY_REGENERATION_EXHAUSTED"
          : isRecoverableCopyError(unexpected.error)
            ? "COPY_QUALITY_REGENERATION_EXHAUSTED"
            : "MANUAL_REVIEW_CONTRACT_VIOLATION";
        return NextResponse.json({
          error: `${code}: forventet manual-review, fikk ${unexpected.mode} (state=${unexpected.state})${detail}`,
          marketingRunId: res.marketingRunId,
          result: {
            state: unexpected.state,
            mode: unexpected.mode,
            error: unexpected.error ?? null,
            propertyId: unexpected.propertyId ?? null,
            propertyRef: unexpected.propertyRef ?? null,
          },
        }, { status: 409 });
      }
    }

    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "campaign-draft feilet";
    const failClosed = message.startsWith("MISSING_") || message.startsWith("INVENTORY_") || message.includes("APPROVAL_SERVICE_UNAVAILABLE");
    return NextResponse.json({ error: message }, { status: failClosed ? 409 : 500 });
  }
}
