import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET = "property-documents";
const MAX_BYTES = 8 * 1024 * 1024;

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function findLead(db: NonNullable<ReturnType<typeof supabaseClient>>, id: string) {
  const { data, error } = await db.from("work_items")
    .select("id,brand_id,source_type,metadata").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const meta = record(data?.metadata);
  if (!data || data.brand_id !== "zeneco" || data.source_type !== "website_lead"
    || !(meta.segment === "care" || String(meta.request_type || "").startsWith("care-"))) return null;
  return { data, meta };
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Ugyldig lead." }, { status: 400 });
  const db = supabaseClient();
  if (!db) return NextResponse.json({ error: "Database mangler." }, { status: 503 });
  try {
    const lead = await findLead(db, params.id);
    if (!lead) return NextResponse.json({ error: "Care-leadet finnes ikke." }, { status: 404 });
    if (lead.meta.care_contract_id) return NextResponse.json({ error: "Avtalen er allerede aktivert." }, { status: 409 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES || file.type !== "application/pdf") {
      return NextResponse.json({ error: "Velg en PDF på maks 8 MB." }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
      return NextResponse.json({ error: "Filen er ikke en gyldig PDF." }, { status: 400 });
    }
    const path = `care-offers/${params.id}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });
    const metadata = { ...lead.meta, care_offer_pdf_path: path, care_offer_pdf_name: file.name.slice(0, 180), care_offer_pdf_uploaded_at: new Date().toISOString() };
    const { error: updateError } = await db.from("work_items").update({ metadata }).eq("id", params.id).eq("brand_id", "zeneco");
    if (updateError) {
      await db.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, filename: metadata.care_offer_pdf_name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kunne ikke lagre tilbud." }, { status: 400 });
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  if (!UUID.test(params.id)) return NextResponse.json({ error: "Ugyldig lead." }, { status: 400 });
  const db = supabaseClient();
  if (!db) return NextResponse.json({ error: "Database mangler." }, { status: 503 });
  try {
    const lead = await findLead(db, params.id);
    if (!lead) return NextResponse.json({ error: "Care-leadet finnes ikke." }, { status: 404 });
    const path = String(lead.meta.care_offer_pdf_path || "");
    if (!path.startsWith(`care-offers/${params.id}/`) || !path.endsWith(".pdf")) {
      return NextResponse.json({ error: "Ingen tilbuds-PDF er lastet opp." }, { status: 404 });
    }
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || "Kunne ikke åpne PDF." }, { status: 400 });
    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kunne ikke hente tilbud." }, { status: 400 });
  }
}
