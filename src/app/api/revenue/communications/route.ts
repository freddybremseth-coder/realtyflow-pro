import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { isAdminEmail, verifyAdminSession } from "@/lib/admin-auth";
import {
  buildCommunicationWorkspace,
  type CommunicationWorkspace,
  type ManualCommunicationChannel,
} from "@/lib/revenue/communications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OPTIONAL_TABLE_PATTERN = /schema cache|does not exist|not find the table|relation .* does not exist|could not find/i;
const ACTIONS = new Set([
  "UPDATE_DRAFT",
  "APPROVE_DRAFT",
  "CANCEL_DRAFT",
  "LOG_MANUAL_SEND",
]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown, max = 12_000) {
  return String(value || "").trim().slice(0, max);
}

function errorText(error: unknown) {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const row = error as Record<string, unknown>;
    return [row.code, row.message, row.details, row.hint].filter(Boolean).map(String).join(" ");
  }
  return String(error);
}

async function adminIdentity(request: NextRequest) {
  const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (session?.email) return session.email.toLowerCase();
  const proxyEmail = request.headers.get("x-remaster-admin");
  return isAdminEmail(proxyEmail) ? String(proxyEmail).trim().toLowerCase() : null;
}

function settledRows(result: PromiseSettledResult<any>, table: string, warnings: string[]) {
  if (result.status === "rejected") {
    warnings.push(`${table}: ${result.reason instanceof Error ? result.reason.message : "ukjent feil"}`);
    return [];
  }
  if (result.value?.error) {
    const message = errorText(result.value.error);
    if (!OPTIONAL_TABLE_PATTERN.test(message)) warnings.push(`${table}: ${message}`);
    return [];
  }
  return result.value?.data || [];
}

async function loadWorkspace(supabase: any): Promise<CommunicationWorkspace> {
  const results = await Promise.allSettled([
    supabase.from("contacts").select("id,name,email,phone,brand,brand_id,interactions,updated_at").order("updated_at", { ascending: false }).limit(2000),
    supabase.from("buyer_profiles").select("id,brand,contact_id,status,summary,created_at,updated_at").order("updated_at", { ascending: false }).limit(1000),
    supabase.from("lead_property_shortlists").select("id,brand,buyer_profile_id,status,title,created_at,updated_at").order("updated_at", { ascending: false }).limit(1000),
    supabase.from("lead_customer_presentations").select("id,brand,buyer_profile_id,shortlist_id,status,title,presentation_json,created_at,updated_at").order("updated_at", { ascending: false }).limit(1000),
    supabase.from("lead_customer_message_drafts").select("id,brand,presentation_id,buyer_profile_id,shortlist_id,channel,status,subject,body_text,body_html,language,payload_hash,correlation_id,created_by,approved_by,approved_at,sent_at,cancelled_at,created_at,updated_at").order("updated_at", { ascending: false }).limit(1000),
  ]);
  const warnings: string[] = [];
  return buildCommunicationWorkspace({
    contacts: settledRows(results[0], "contacts", warnings),
    profiles: settledRows(results[1], "buyer_profiles", warnings),
    shortlists: settledRows(results[2], "lead_property_shortlists", warnings),
    presentations: settledRows(results[3], "lead_customer_presentations", warnings),
    drafts: settledRows(results[4], "lead_customer_message_drafts", warnings),
    warnings,
  });
}

async function readDraftContext(supabase: any, draftId: string) {
  const draftResult = await supabase.from("lead_customer_message_drafts").select("*").eq("id", draftId).single();
  if (draftResult.error || !draftResult.data) {
    return { error: errorText(draftResult.error) || "Communication draft not found", workspace: null, draft: null, contact: null };
  }
  const draft = draftResult.data;
  const [profileResult, shortlistResult, presentationResult] = await Promise.all([
    supabase.from("buyer_profiles").select("id,brand,contact_id,status,summary,created_at,updated_at").eq("id", draft.buyer_profile_id).single(),
    supabase.from("lead_property_shortlists").select("id,brand,buyer_profile_id,status,title,created_at,updated_at").eq("id", draft.shortlist_id).single(),
    supabase.from("lead_customer_presentations").select("id,brand,buyer_profile_id,shortlist_id,status,title,presentation_json,created_at,updated_at").eq("id", draft.presentation_id).single(),
  ]);
  if (profileResult.error || shortlistResult.error || presentationResult.error) {
    return {
      error: [profileResult.error, shortlistResult.error, presentationResult.error].map(errorText).filter(Boolean).join(" | ") || "Communication dependencies were not found",
      workspace: null,
      draft,
      contact: null,
    };
  }
  const profile = profileResult.data;
  let contact: any = null;
  if (profile?.contact_id) {
    const contactResult = await supabase.from("contacts").select("id,name,email,phone,brand,brand_id,interactions,updated_at").eq("id", profile.contact_id).single();
    if (!contactResult.error) contact = contactResult.data;
  }
  const workspace = buildCommunicationWorkspace({
    contacts: contact ? [contact] : [],
    profiles: profile ? [profile] : [],
    shortlists: shortlistResult.data ? [shortlistResult.data] : [],
    presentations: presentationResult.data ? [presentationResult.data] : [],
    drafts: [draft],
  });
  return { error: "", workspace, draft, contact };
}

function payloadHash(input: { brand: string; draftId: string; subject: string; bodyText: string; language: string | null }) {
  const payload = JSON.stringify({
    version: 1,
    brand: input.brand,
    draftId: input.draftId,
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: null,
    language: input.language,
  });
  return `sha256:v1:${createHash("sha256").update(payload).digest("hex")}`;
}

function manualLogExists(interactions: unknown, draftId: string, channel: ManualCommunicationChannel) {
  if (!Array.isArray(interactions)) return false;
  return interactions.some((raw) => {
    if (!raw || typeof raw !== "object") return false;
    const row = raw as Record<string, any>;
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    return clean(row.action || metadata.action, 100).toLowerCase() === "communication_manual_send_logged"
      && clean(metadata.draft_id || row.draft_id, 120) === draftId
      && clean(metadata.channel || row.channel, 30).toUpperCase() === channel;
  });
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { workspace: null });
  if (adminError) return adminError;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", workspace: null }, { status: 500 });
  const workspace = await loadWorkspace(supabase);
  return NextResponse.json({ workspace });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;
  const actor = await adminIdentity(request);
  if (!actor) return NextResponse.json({ error: "Admin identity could not be verified" }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 30_000) return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 80).toUpperCase();
  const draftId = clean(body.draftId, 120);
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Unsupported communications action" }, { status: 400 });
  if (!draftId) return NextResponse.json({ error: "draftId is required" }, { status: 400 });

  const context = await readDraftContext(supabase, draftId);
  if (context.error || !context.draft || !context.workspace?.items[0]) {
    return NextResponse.json({ error: context.error || "Communication context could not be loaded" }, { status: 404 });
  }
  const draft = context.draft;
  const item = context.workspace.items[0];

  if (action === "UPDATE_DRAFT") {
    if (String(draft.status).toLowerCase() !== "draft") {
      return NextResponse.json({ error: "Only draft messages can be edited. Create a new version instead." }, { status: 409 });
    }
    const subject = clean(body.subject, 512);
    const bodyText = clean(body.bodyText, 12_000);
    const language = clean(body.language, 20) || null;
    if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    if (!bodyText) return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    if (language && !/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
      return NextResponse.json({ error: "Language must use a valid language code" }, { status: 400 });
    }
    const nextHash = payloadHash({ brand: draft.brand, draftId, subject, bodyText, language });
    const update = await supabase
      .from("lead_customer_message_drafts")
      .update({ subject, body_text: bodyText, body_html: null, language, payload_hash: nextHash, updated_at: new Date().toISOString() })
      .eq("id", draftId)
      .eq("status", "draft")
      .select("id,status,subject,body_text,language,updated_at")
      .single();
    if (update.error) return NextResponse.json({ error: errorText(update.error) }, { status: 500 });
    return NextResponse.json({ ok: true, action, draft: update.data, noProviderSend: true });
  }

  const explicitApproval = body.explicitApproval === true;
  if (!explicitApproval) return NextResponse.json({ error: "Explicit confirmation is required" }, { status: 400 });

  if (action === "APPROVE_DRAFT") {
    if (String(draft.status).toLowerCase() === "approved") {
      return NextResponse.json({ ok: true, action, duplicate: true, draftId, noProviderSend: true });
    }
    if (String(draft.status).toLowerCase() !== "draft") {
      return NextResponse.json({ error: "Only a draft can be approved" }, { status: 409 });
    }
    if (!item.approvalReady) {
      return NextResponse.json({ error: "Draft is blocked from approval", blockers: item.approvalBlockers }, { status: 409 });
    }
    const approvedAt = new Date().toISOString();
    const update = await supabase
      .from("lead_customer_message_drafts")
      .update({ status: "approved", approved_by: actor, approved_at: approvedAt, cancelled_at: null, sent_at: null, updated_at: approvedAt })
      .eq("id", draftId)
      .eq("status", "draft")
      .select("id,status,approved_by,approved_at,updated_at")
      .single();
    if (update.error) return NextResponse.json({ error: errorText(update.error) }, { status: 500 });
    return NextResponse.json({ ok: true, action, draft: update.data, noProviderSend: true });
  }

  if (action === "CANCEL_DRAFT") {
    if (String(draft.status).toLowerCase() === "cancelled") {
      return NextResponse.json({ ok: true, action, duplicate: true, draftId, noProviderSend: true });
    }
    if (!["draft", "approved"].includes(String(draft.status).toLowerCase())) {
      return NextResponse.json({ error: "Draft cannot be cancelled from its current state" }, { status: 409 });
    }
    const cancelledAt = new Date().toISOString();
    const update = await supabase
      .from("lead_customer_message_drafts")
      .update({ status: "cancelled", approved_by: null, approved_at: null, sent_at: null, cancelled_at: cancelledAt, updated_at: cancelledAt })
      .eq("id", draftId)
      .select("id,status,cancelled_at,updated_at")
      .single();
    if (update.error) return NextResponse.json({ error: errorText(update.error) }, { status: 500 });
    return NextResponse.json({ ok: true, action, draft: update.data, noProviderSend: true });
  }

  const channel = clean(body.channel, 30).toUpperCase() as ManualCommunicationChannel;
  if (!(["EMAIL", "WHATSAPP"] as string[]).includes(channel)) {
    return NextResponse.json({ error: "Manual channel must be EMAIL or WHATSAPP" }, { status: 400 });
  }
  if (String(draft.status).toLowerCase() !== "approved") {
    return NextResponse.json({ error: "Only approved content can be logged as manually sent" }, { status: 409 });
  }
  if (!context.contact || !item.contactId) {
    return NextResponse.json({ error: "A linked contact is required" }, { status: 409 });
  }
  if (channel === "EMAIL" && !item.manualEmailReady) {
    return NextResponse.json({ error: "Email preflight is not ready", blockers: item.approvalBlockers }, { status: 409 });
  }
  if (channel === "WHATSAPP" && !item.manualWhatsAppReady) {
    return NextResponse.json({ error: "WhatsApp preflight is not ready", warnings: item.preflightWarnings }, { status: 409 });
  }
  const interactions = Array.isArray(context.contact.interactions) ? context.contact.interactions : [];
  if (manualLogExists(interactions, draftId, channel)) {
    return NextResponse.json({ ok: true, action, duplicate: true, draftId, channel, noProviderSend: true });
  }
  const sentAt = new Date().toISOString();
  const interaction = {
    id: `manual-communication-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: channel === "EMAIL" ? "email" : "whatsapp",
    action: "communication_manual_send_logged",
    direction: "out",
    date: sentAt,
    content: `Manuell ${channel === "EMAIL" ? "e-post" : "WhatsApp"} registrert fra godkjent utkast: ${item.subject}`.slice(0, 800),
    metadata: {
      action: "communication_manual_send_logged",
      source: "controlled-communications",
      draft_id: draftId,
      presentation_id: item.presentationId,
      buyer_profile_id: item.buyerProfileId,
      channel,
      sent_at: sentAt,
      sent_by: actor,
      no_provider_send: true,
      message_body_stored: false,
    },
  };
  const contactUpdate = await supabase
    .from("contacts")
    .update({ interactions: [interaction, ...interactions], updated_at: sentAt })
    .eq("id", item.contactId)
    .select("id,updated_at")
    .single();
  if (contactUpdate.error) return NextResponse.json({ error: errorText(contactUpdate.error) }, { status: 500 });
  return NextResponse.json({ ok: true, action, draftId, channel, loggedAt: sentAt, contact: contactUpdate.data, noProviderSend: true });
}
