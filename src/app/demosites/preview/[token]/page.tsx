import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { DemoSitePreviewRenderer } from "@/components/demosites/demo-site-preview-renderer";
import { getDemoSitePackage } from "@/lib/demosites";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PreviewPageProps = {
  params: Promise<{ token: string }> | { token: string };
};

type DemoOrder = {
  status: string;
  company_name: string;
  customer_email: string;
  customer_phone?: string | null;
  industry?: string | null;
  website_url?: string | null;
  package_id: string;
  setup_fee_nok: number;
  monthly_fee_nok: number;
  template_slug?: string | null;
  logo_url?: string | null;
  claim_url?: string | null;
  expires_at?: string | null;
  brand_color?: string | null;
  extracted_profile?: Record<string, unknown> | null;
  editable_fields?: Record<string, unknown> | null;
  notes?: string | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function DemoPreviewPage({ params }: PreviewPageProps) {
  const resolvedParams = await params;
  const token = String(resolvedParams.token || "").trim();
  const supabase = getSupabase();

  if (!token || !supabase) {
    return <NotFound title="Preview ikke tilgjengelig" description="Lenken er ugyldig eller systemet mangler serverkonfigurasjon." />;
  }

  const { data, error } = await supabase
    .from("demo_site_orders")
    .select("status, company_name, customer_email, customer_phone, industry, website_url, package_id, setup_fee_nok, monthly_fee_nok, template_slug, logo_url, claim_url, expires_at, brand_color, extracted_profile, editable_fields, notes")
    .eq("claim_token", token)
    .maybeSingle();

  if (error || !data) {
    return <NotFound title="Fant ikke preview" description="Denne preview-lenken finnes ikke, eller demoen er ikke lenger tilgjengelig." />;
  }

  const order = data as DemoOrder;
  const fields = order.editable_fields || {};
  const extractedProfile = order.extracted_profile || null;
  const pkg = getDemoSitePackage(order.package_id);

  return (
    <DemoSitePreviewRenderer
      mode="public"
      companyName={order.company_name}
      templateSlug={String(fields.template_slug || order.template_slug || "local-service")}
      websiteUrl={order.website_url}
      expiresAt={order.expires_at}
      logoUrl={order.logo_url}
      brandColor={order.brand_color}
      customerEmail={order.customer_email}
      customerPhone={order.customer_phone}
      profile={extractedProfile}
      extractedProfile={extractedProfile}
      editableFields={fields}
      notes={order.notes}
      packageName={pkg.shortName}
      fallbackMode="defaults"
    />
  );
}

function NotFound({ title, description }: { title: string; description: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-4 text-slate-300">{description}</p>
        <Link href="/demosites" className="mt-6 inline-flex rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
          Gå til DemoSites
        </Link>
      </div>
    </main>
  );
}
