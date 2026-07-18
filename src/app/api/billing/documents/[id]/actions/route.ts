import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { billingDatabaseError, requireBillingOrganization, requireBillingRequest } from "@/lib/billing/request";
import { paymentInputSchema, validationMessage } from "@/lib/billing/validation";
import { copyDocumentLines, copyDocumentPayload, loadBillingDocumentBundle, normalizeBillingLinesForSave } from "@/services/billing/document-service";
import { generateAndStoreBillingPdf, markBillingPdfForRetry } from "@/services/billing/pdf-storage";
import { sendBrandEmail } from "@/services/email/send-brand-email";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("issue"), issueDate: z.string().date().optional(), expectedVersion: z.number().int().positive().optional() }),
  z.object({ action: z.literal("payment"), payment: paymentInputSchema }),
  z.object({ action: z.literal("convert_to_invoice") }),
  z.object({ action: z.literal("create_credit_note"), reason: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal("send"), recipient: z.string().trim().email().optional(), subject: z.string().trim().max(240).optional(), message: z.string().trim().max(5000).optional() }),
]);

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireBillingRequest(request, "write");
  if (!auth.value) return auth.response;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const action = parsed.data;

  let bundle;
  try {
    bundle = await loadBillingDocumentBundle(auth.value.supabase, params.id);
  } catch (error) {
    return billingDatabaseError(error, "Dokumentet kunne ikke lastes.");
  }
  const denied = await requireBillingOrganization(auth.value, bundle.document.organization_id, true);
  if (denied) return denied;

  if (action.action === "issue") {
    const issueDate = action.issueDate || new Date().toISOString().slice(0, 10);
    const { data, error } = await auth.value.supabase.rpc("billing_issue_document", {
      p_document_id: params.id,
      p_actor_email: auth.value.context.email,
      p_issue_date: issueDate,
      p_expected_version: action.expectedVersion ?? bundle.document.version,
    });
    if (error) return billingDatabaseError(error);
    let pdfWarning: string | null = null;
    try {
      await generateAndStoreBillingPdf(auth.value.supabase, params.id);
    } catch (pdfError) {
      pdfWarning = pdfError instanceof Error ? pdfError.message : "PDF-generering venter på nytt forsøk.";
      await markBillingPdfForRetry(auth.value.supabase, params.id, pdfError);
    }
    const issued = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ issued, pdfWarning });
  }

  if (action.action === "payment") {
    const payment = action.payment;
    const { data, error } = await auth.value.supabase.rpc("billing_record_payment", {
      p_document_id: params.id,
      p_amount: payment.amount,
      p_payment_date: payment.paymentDate,
      p_currency: payment.currency,
      p_method: payment.method,
      p_reference: payment.reference || "",
      p_notes: payment.notes || "",
      p_actor_email: auth.value.context.email,
    });
    if (error) return billingDatabaseError(error);
    return NextResponse.json({ paymentId: data });
  }

  if (action.action === "convert_to_invoice") {
    if (bundle.document.document_type !== "quote" || !bundle.document.locked_at) {
      return NextResponse.json({ error: "Bare utstedte tilbud kan konverteres til faktura." }, { status: 409 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const sourceLines = copyDocumentLines(bundle.lines);
    const lines = await normalizeBillingLinesForSave({
      supabase: auth.value.supabase,
      organizationId: bundle.document.organization_id,
      customerId: bundle.document.customer_id,
      lines: sourceLines,
    });
    const { data, error } = await auth.value.supabase.rpc("billing_save_draft", {
      p_document_id: null,
      p_organization_id: bundle.document.organization_id,
      p_document_type: "invoice",
      p_customer_id: bundle.document.customer_id,
      p_payload: copyDocumentPayload(bundle.document, {
        originalDocumentId: bundle.document.id,
        issueDate: today,
        dueDate: addDays(today, bundle.customer?.payment_terms_days ?? bundle.organization?.payment_terms_days ?? 14),
        validUntil: "",
      }),
      p_lines: lines,
      p_actor_email: auth.value.context.email,
    });
    if (error) return billingDatabaseError(error);
    return NextResponse.json({ documentId: data });
  }

  if (action.action === "create_credit_note") {
    if (bundle.document.document_type !== "invoice" || !bundle.document.locked_at) {
      return NextResponse.json({ error: "Kreditnota må opprettes fra en utstedt faktura." }, { status: 409 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const sourceLines = copyDocumentLines(bundle.lines);
    const { data, error } = await auth.value.supabase.rpc("billing_save_draft", {
      p_document_id: null,
      p_organization_id: bundle.document.organization_id,
      p_document_type: "credit_note",
      p_customer_id: bundle.document.customer_id,
      p_payload: copyDocumentPayload(bundle.document, {
        originalDocumentId: bundle.document.id,
        issueDate: today,
        dueDate: "",
        validUntil: "",
        rectificationReason: action.reason,
        notes: `Korrigerer faktura ${bundle.document.document_number || bundle.document.id}.`,
      }),
      p_lines: sourceLines,
      p_actor_email: auth.value.context.email,
    });
    if (error) return billingDatabaseError(error);
    return NextResponse.json({ documentId: data });
  }

  if (!bundle.document.locked_at || !["invoice", "quote", "proforma", "credit_note"].includes(bundle.document.document_type)) {
    return NextResponse.json({ error: "Dokumentet må utstedes før det kan sendes." }, { status: 409 });
  }
  const recipient = action.recipient || bundle.customer?.email;
  if (!recipient) return NextResponse.json({ error: "Kunden mangler e-postadresse." }, { status: 400 });
  const { buffer } = await generateAndStoreBillingPdf(auth.value.supabase, params.id);
  const typeLabel = bundle.document.document_type === "invoice" ? "Faktura" : bundle.document.document_type === "quote" ? "Tilbud" : bundle.document.document_type === "credit_note" ? "Kreditnota" : "Proforma";
  const subject = action.subject || `${typeLabel} ${bundle.document.document_number} fra ${bundle.organization.trading_name || bundle.organization.legal_name}`;
  const bodyText = action.message || `Hei,\n\nVedlagt følger ${typeLabel.toLowerCase()} ${bundle.document.document_number}.\n\nVennlig hilsen\n${bundle.organization.trading_name || bundle.organization.legal_name}`;
  await auth.value.supabase.from("billing_email_events").insert({
    organization_id: bundle.document.organization_id,
    document_id: params.id,
    event_type: "queued",
    recipient,
  });
  const result = await sendBrandEmail(auth.value.supabase, {
    brandId: bundle.organization.slug,
    to: [recipient],
    subject,
    bodyText,
    attachments: [{ filename: `${bundle.document.document_number}.pdf`, content: buffer, contentType: "application/pdf" }],
  });
  if (!result.success) {
    await auth.value.supabase.from("billing_email_events").insert({
      organization_id: bundle.document.organization_id,
      document_id: params.id,
      event_type: "failed",
      recipient,
      metadata: { error: result.error, skipped: result.skipped },
    });
    return NextResponse.json({ error: result.skipped ? "Firmaet mangler aktiv SMTP-konfigurasjon under E-post AI." : result.error || "E-posten kunne ikke sendes." }, { status: 409 });
  }
  const now = new Date().toISOString();
  await Promise.all([
    auth.value.supabase.from("billing_documents").update({ status: "sent", sent_at: now }).eq("id", params.id),
    auth.value.supabase.from("billing_email_events").insert({
      organization_id: bundle.document.organization_id,
      document_id: params.id,
      event_type: "sent",
      recipient,
      provider_message_id: result.messageId || null,
    }),
    auth.value.supabase.from("billing_audit_events").insert({
      organization_id: bundle.document.organization_id,
      actor_email: auth.value.context.email,
      action: "document_sent",
      resource_type: "billing_document",
      resource_id: params.id,
      metadata: { recipient, messageId: result.messageId || null },
    }),
  ]);
  return NextResponse.json({ sent: true, messageId: result.messageId });
}
