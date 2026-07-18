import "server-only";
import { createHash } from "node:crypto";
import type { BillingSupabaseClient } from "@/lib/billing/supabase";
import { renderBillingInvoicePdf } from "@/services/billing/invoice-pdf";

export async function generateAndStoreBillingPdf(supabase: BillingSupabaseClient, documentId: string) {
  const { data: snapshotRow, error: snapshotError } = await supabase
    .from("billing_document_snapshots")
    .select("organization_id,document_id,snapshot,content_hash,pdf_storage_path")
    .eq("document_id", documentId)
    .single();
  if (snapshotError || !snapshotRow) throw new Error(snapshotError?.message || "Dokumentøyeblikksbildet mangler");

  const buffer = await renderBillingInvoicePdf(snapshotRow.snapshot, snapshotRow.content_hash);
  const document = (snapshotRow.snapshot as Record<string, any>)?.document || {};
  const issueYear = String(document.issue_date || new Date().toISOString()).slice(0, 4);
  const safeNumber = String(document.document_number || documentId).replace(/[^a-zA-Z0-9_.-]+/g, "-");
  const storagePath = `${snapshotRow.organization_id}/${issueYear}/${safeNumber}.pdf`;
  const pdfHash = createHash("sha256").update(buffer).digest("hex");
  const { error: uploadError } = await supabase.storage
    .from("billing-documents")
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw new Error(uploadError.message);

  const generatedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("billing_document_snapshots")
    .update({ pdf_storage_path: storagePath, pdf_hash: pdfHash, pdf_generated_at: generatedAt })
    .eq("document_id", documentId);
  if (updateError) throw new Error(updateError.message);
  await supabase
    .from("billing_delivery_jobs")
    .update({ status: "completed", completed_at: generatedAt, updated_at: generatedAt, last_error: null })
    .eq("document_id", documentId)
    .eq("job_type", "generate_pdf")
    .in("status", ["pending", "processing", "retry", "failed"]);
  return { buffer, storagePath, pdfHash };
}

export async function markBillingPdfForRetry(supabase: BillingSupabaseClient, documentId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "PDF generation failed");
  await supabase
    .from("billing_delivery_jobs")
    .update({ status: "retry", last_error: message.slice(0, 2000), available_at: new Date(Date.now() + 5 * 60_000).toISOString(), updated_at: new Date().toISOString() })
    .eq("document_id", documentId)
    .eq("job_type", "generate_pdf")
    .in("status", ["pending", "processing", "failed"]);
}
