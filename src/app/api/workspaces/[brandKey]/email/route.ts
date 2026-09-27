import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import { getWorkspaceEmailRuntime } from "@/lib/workspaces/email-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

const noStore = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(status: number, code: string, message?: string) {
  return NextResponse.json({ ok: false, error: { code, ...(message ? { message } : {}) } }, { status, headers: noStore });
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanJson(value: string) {
  const stripped = value.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  return start >= 0 && end >= start ? stripped.slice(start, end + 1) : stripped;
}

async function senderStatus(supabase: any, brandKey: string) {
  const { data, error } = await supabase
    .from("brand_email_configs")
    .select("email_address,display_name,is_active,health_status")
    .eq("brand_id", brandKey)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) return { configured: false, email: null, displayName: null, healthStatus: null };
  return {
    configured: true,
    email: data.email_address || null,
    displayName: data.display_name || null,
    healthStatus: data.health_status || null,
  };
}

async function finalize(
  supabase: any,
  params: {
    brandKey: string;
    userId: string;
    email: string;
    draftId: string;
    success: boolean;
    messageId?: string | null;
    error?: string | null;
  },
) {
  return supabase.rpc("workspace_brand_email_send_finalize", {
    p_brand_key: params.brandKey,
    p_user_id: params.userId,
    p_email: params.email,
    p_draft_id: params.draftId,
    p_success: params.success,
    p_message_id: params.messageId || null,
    p_error: params.error || null,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const access = await requireBrandWorkspace(request, params.brandKey, "email.read");
  if (!access.value) return access.response;
  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

  const search = clean(new URL(request.url).searchParams.get("q"), 80);
  const [{ data, error }, sender] = await Promise.all([
    access.value.supabase.rpc("workspace_brand_email_snapshot", {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
      p_search: search,
    }),
    senderStatus(access.value.supabase, params.brandKey),
  ]);
  if (error || !data) return fail(503, "EMAIL_WORKSPACE_UNAVAILABLE");

  return NextResponse.json({
    ok: true,
    brand: params.brandKey,
    sender,
    targets: Array.isArray(data.targets) ? data.targets : [],
    drafts: Array.isArray(data.drafts) ? data.drafts : [],
  }, { headers: noStore });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");
  const body: any = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "INVALID_REQUEST");
  const action = clean(body.action, 40);

  if (action === "save") {
    const access = await requireBrandWorkspace(request, params.brandKey, "email.draft");
    if (!access.value) return access.response;
    if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

    const targetType = clean(body.targetType, 20);
    const targetId = clean(body.targetId, 80);
    const subject = clean(body.subject, 180);
    const bodyText = clean(body.bodyText, 15000);
    const draftId = clean(body.draftId, 80);
    if (!["lead", "corporate", "partner"].includes(targetType) || !uuid.test(targetId) ||
        !subject || !bodyText || (draftId && !uuid.test(draftId))) {
      return fail(400, "INVALID_EMAIL_DRAFT");
    }

    const { data, error } = await access.value.supabase.rpc("workspace_brand_email_draft_save", {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
      p_draft_id: draftId || null,
      p_target_type: targetType,
      p_target_id: targetId,
      p_subject: subject,
      p_body_text: bodyText,
    });
    if (error || !data) return fail(409, "EMAIL_DRAFT_SAVE_FAILED",
      "Mottakeren er ikke lenger tilgjengelig i dette arbeidsområdet, eller utkastet kan ikke endres.");
    return NextResponse.json({ ok: true, draft: data }, { headers: noStore });
  }

  if (action === "send") {
    const access = await requireBrandWorkspace(request, params.brandKey, "email.send");
    if (!access.value) return access.response;
    if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

    const draftId = clean(body.draftId, 80);
    if (!uuid.test(draftId)) return fail(400, "INVALID_DRAFT_ID");

    const { data: prepared, error: prepareError } = await access.value.supabase.rpc(
      "workspace_brand_email_send_prepare",
      {
        p_brand_key: params.brandKey,
        p_user_id: access.value.verifiedUserId,
        p_email: access.value.verifiedEmail,
        p_draft_id: draftId,
      },
    );
    if (prepareError || !prepared) return fail(409, "EMAIL_SEND_NOT_READY",
      "Utkastet, mottakeren eller sendetilgangen er ikke lenger gyldig.");

    // Revalidate the exact live identity + brand + send grant immediately
    // before the irreversible external SMTP action.
    const recheck = await requireBrandWorkspace(request, params.brandKey, "email.send");
    if (!recheck.value || !recheck.value.verifiedUserId ||
        recheck.value.verifiedUserId !== access.value.verifiedUserId) {
      await finalize(access.value.supabase, {
        brandKey: params.brandKey, userId: access.value.verifiedUserId,
        email: access.value.verifiedEmail, draftId, success: false,
        error: "Sendetilgangen ble endret før sending.",
      });
      return recheck.response || fail(403, "ACCESS_DENIED");
    }

    const recipient = clean(prepared.recipientEmail, 254).toLowerCase();
    if (!recipient || !recipient.includes("@")) {
      await finalize(access.value.supabase, {
        brandKey: params.brandKey, userId: access.value.verifiedUserId,
        email: access.value.verifiedEmail, draftId, success: false,
        error: "Mottakeren er ikke gyldig.",
      });
      return fail(409, "RECIPIENT_NOT_AVAILABLE");
    }

    const runtime = getWorkspaceEmailRuntime();
    const suppression = await runtime.checkSuppression(access.value.supabase as any, [recipient]);
    if (suppression.error || suppression.blocked) {
      await finalize(access.value.supabase, {
        brandKey: params.brandKey, userId: access.value.verifiedUserId,
        email: access.value.verifiedEmail, draftId, success: false,
        error: suppression.error || "Mottakeren har avmeldt eller er sperret i CRM.",
      });
      return fail(suppression.error ? 503 : 409,
        suppression.error ? "SUPPRESSION_CHECK_FAILED" : "RECIPIENT_SUPPRESSED",
        suppression.error ? "Kunne ikke kontrollere avmeldingsstatus." : "Mottakeren har avmeldt eller er sperret.");
    }

    const { data: config, error: configError } = await access.value.supabase
      .from("brand_email_configs")
      .select("*")
      .eq("brand_id", params.brandKey)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (configError || !config) {
      await finalize(access.value.supabase, {
        brandKey: params.brandKey, userId: access.value.verifiedUserId,
        email: access.value.verifiedEmail, draftId, success: false,
        error: "Ingen aktiv e-postkonto er konfigurert for merkevaren.",
      });
      return fail(409, "BRAND_EMAIL_NOT_CONFIGURED",
        "Ingen aktiv e-postkonto er konfigurert for denne merkevaren.");
    }

    let smtp;
    try {
      smtp = await runtime.buildSmtp(config as any, config.display_name || undefined);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "E-postkontoen kunne ikke åpnes.";
      await finalize(access.value.supabase, {
        brandKey: params.brandKey, userId: access.value.verifiedUserId,
        email: access.value.verifiedEmail, draftId, success: false, error: message,
      });
      return fail(503, "BRAND_EMAIL_AUTH_FAILED", "Merkevarens e-postkonto trenger ny tilkobling.");
    }

    const result = await runtime.send(smtp, {
      to: [recipient],
      subject: clean(prepared.subject, 180),
      bodyText: clean(prepared.bodyText, 15000),
    });
    if (!result.success) {
      await finalize(access.value.supabase, {
        brandKey: params.brandKey, userId: access.value.verifiedUserId,
        email: access.value.verifiedEmail, draftId, success: false,
        error: result.error || "SMTP-sending feilet.",
      });
      return fail(502, "EMAIL_SEND_FAILED", "E-posten kunne ikke sendes.");
    }

    const sentAt = new Date().toISOString();
    const targetType = clean(prepared.targetType, 20);
    const targetId = clean(prepared.targetId, 80);
    const { error: logError } = await access.value.supabase.from("email_messages").insert({
      brand_id: params.brandKey,
      message_id: result.messageId || null,
      thread_id: result.messageId || null,
      direction: "outbound",
      from_address: config.email_address,
      from_name: config.display_name || null,
      to_addresses: [recipient],
      subject: clean(prepared.subject, 180),
      body_text: clean(prepared.bodyText, 15000),
      body_html: null,
      is_read: true,
      received_at: sentAt,
      crm_contact_id: targetType === "lead" && uuid.test(targetId) ? targetId : null,
    });
    if (logError) console.warn("[Workspace Email] sent message log failed", logError.message);

    if (targetType === "lead" && uuid.test(targetId)) {
      const { error: contactUpdateError } = await access.value.supabase
        .from("contacts")
        .update({ last_contact: sentAt, updated_at: sentAt })
        .eq("id", targetId)
        .eq("brand_id", params.brandKey)
        .eq("brand", params.brandKey);
      if (contactUpdateError) console.warn("[Workspace Email] contact timestamp update failed", contactUpdateError.message);
    } else if (params.brandKey === "zeneco" && uuid.test(targetId) &&
               ["corporate", "partner"].includes(targetType)) {
      const table = targetType === "corporate" ? "corporate_prospects" : "corporate_partner_prospects";
      const { error: corporateUpdateError } = await access.value.supabase
        .from(table)
        .update({
          status: "CONTACTED",
          next_action: "Follow up after direct outreach",
          next_followup: new Date(Date.now() + 7 * 86400000).toISOString(),
          updated_at: sentAt,
        })
        .eq("id", targetId)
        .eq("brand_id", "zeneco")
        .neq("status", "DISQUALIFIED");
      if (corporateUpdateError) console.warn("[Workspace Email] Corporate status update failed", corporateUpdateError.message);
    }

    const { error: finalizeError } = await finalize(access.value.supabase, {
      brandKey: params.brandKey, userId: access.value.verifiedUserId,
      email: access.value.verifiedEmail, draftId, success: true,
      messageId: result.messageId || null,
    });
    if (finalizeError) console.warn("[Workspace Email] finalization failed after successful SMTP send", finalizeError.message);

    return NextResponse.json({
      ok: true,
      sent: true,
      recipientLabel: clean(prepared.recipientLabel, 180),
      sentAt,
    }, { headers: noStore });
  }

  if (action === "campaign_draft") {
    const access = await requireBrandWorkspace(request, params.brandKey, "email.draft");
    if (!access.value) return access.response;
    if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");

    const campaignType = clean(body.campaignType, 40) || "info";
    const topic = clean(body.topic, 2000);
    if (!["nyhetsbrev", "kampanje", "prisoppdatering", "info", "corporate"].includes(campaignType)) {
      return fail(400, "INVALID_CAMPAIGN_TYPE");
    }

    const { data: brandRow } = await access.value.supabase
      .from("brand_settings")
      .select("settings")
      .eq("brand_id", params.brandKey)
      .maybeSingle();
    const settings = (brandRow?.settings || {}) as Record<string, unknown>;
    const brandName = clean(settings.name, 120) ||
      (params.brandKey === "zeneco" ? "Zen Eco Homes" :
       params.brandKey === "pinosoecolife" ? "Pinoso EcoLife" : params.brandKey);
    const brandContext = [
      brandName, clean(settings.description, 1000), clean(settings.tone, 500),
    ].filter(Boolean).join(" · ");

    const typeInstructions: Record<string, string> = {
      nyhetsbrev: "Nyhetsbrev: 2–4 korte, nyttige saker og ett tydelig neste steg.",
      kampanje: "Kampanje: ett konkret tilbud eller budskap, relevant verdi og én tydelig CTA.",
      prisoppdatering: "Pris/boligoppdatering: saklig, nyttig og uten kunstig tidspress.",
      info: "Verdifull informasjon: svar på et reelt kundespørsmål og avslutt med en myk CTA.",
      corporate: "Corporate: skriv for HR, ledelse eller organisasjon. Led med deres forretningsverdi, ikke med en boligannonse.",
    };

    const prompt = `Lag et e-postutkast for ${brandName}.
Brand-kontekst: ${brandContext || brandName}
Type: ${typeInstructions[campaignType]}
Tema/brief: ${topic || "Velg et relevant tema ut fra merkevaren."}

Krav:
- Norsk Bokmål.
- Konkrete og nyttige formuleringer, ingen meta-tekst.
- Ikke finn på priser, juridiske fakta, avkastning eller tilgjengelighet.
- Ikke skriv som om mottakeren allerede har samtykket til markedsføring.
- Dette er et UTKAST. RealtyFlow abonnerer ingen og sender ingen masseutsendelse.
- Emne maks 60 tegn, preheader maks 90 tegn.
- Body skal være ren tekst, 150–500 ord, lett å redigere.

Returner KUN gyldig JSON:
{"subject":"...","preheader":"...","bodyText":"..."}`;

    try {
      const raw = await getWorkspaceEmailRuntime().generateCampaign(prompt);
      const draft = JSON.parse(cleanJson(raw)) as { subject?: string; preheader?: string; bodyText?: string };
      const subject = clean(draft.subject, 60);
      const preheader = clean(draft.preheader, 90);
      const bodyText = clean(draft.bodyText, 15000);
      if (!subject || !bodyText) throw new Error("Utkastet manglet innhold.");
      return NextResponse.json({
        ok: true,
        bulkSendStarted: false,
        subscriberCreated: false,
        draft: { subject, preheader, bodyText },
      }, { headers: noStore });
    } catch {
      return fail(502, "CAMPAIGN_DRAFT_FAILED", "Kampanjeutkastet kunne ikke genereres.");
    }
  }

  return fail(400, "INVALID_ACTION");
}
