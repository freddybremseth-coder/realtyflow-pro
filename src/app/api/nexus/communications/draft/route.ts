import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

function tokens(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

function editRatio(original: string, finalText: string) {
  const a = new Set(tokens(original));
  const b = new Set(tokens(finalText));
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = new Set([...a, ...b]).size;
  return Math.max(0, Math.min(1, 1 - intersection / Math.max(1, union)));
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const draftId = String(body?.draftId || "").trim();
  const subject = String(body?.subject ?? "").trim();
  const bodyText = String(body?.bodyText ?? "").trim();
  if (!draftId || !bodyText) return NextResponse.json({ error: "draftId and bodyText are required" }, { status: 400 });

  const { data: draft, error } = await supabase
    .from("email_drafts")
    .select("id,email_message_id,brand_id,subject,body_text,ai_context,ai_confidence,status")
    .eq("id", draftId)
    .single();
  if (error || !draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (draft.status !== "draft") return NextResponse.json({ error: "Only draft status can be edited" }, { status: 409 });

  const baseline = (draft.ai_context as any)?.original_draft || { subject: draft.subject || "", body_text: draft.body_text || "" };
  const originalCombined = `${baseline.subject || ""}\n${baseline.body_text || ""}`;
  const finalCombined = `${subject}\n${bodyText}`;
  const ratio = editRatio(originalCombined, finalCombined);

  const { error: updateError } = await supabase.from("email_drafts").update({
    subject,
    body_text: bodyText,
    body_html: null,
    edited_by_user: true,
    updated_at: new Date().toISOString(),
  }).eq("id", draftId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabase.from("nexus_communication_learning_observations").insert({
    brand_id: draft.brand_id,
    email_message_id: draft.email_message_id,
    draft_id: draft.id,
    event_type: "user_edit",
    ai_confidence: draft.ai_confidence,
    original_subject: baseline.subject || "",
    original_body: baseline.body_text || "",
    final_subject: subject,
    final_body: bodyText,
    edit_ratio: ratio,
    metadata: { source: "nexus_communications", prior_subject: draft.subject || "", prior_body: draft.body_text || "" },
  });

  return NextResponse.json({ success: true, editRatio: Math.round(ratio * 1000) / 1000 });
}
