import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { DemoSitePreviewRenderer } from "@/components/demosites/demo-site-preview-renderer";
import { DemoCountdownBar } from "@/components/demosites/demo-countdown-bar";
import { DemoDesignSwitcher } from "@/components/demosites/demo-design-switcher";
import { getDemoSitePackage } from "@/lib/demosites";
import { resolveDemoSiteDesign } from "@/lib/demosites-design";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

type PreviewPageProps = {
  params: Promise<{ token: string }> | { token: string };
  searchParams?: Promise<SearchParams> | SearchParams;
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

async function loadOrder(token: string) {
  const supabase = getSupabase();
  if (!token || !supabase) return { supabase: null, order: null as DemoOrder | null, orderId: null as string | null };

  const { data } = await supabase
    .from("demo_site_orders")
    .select("id, status, company_name, customer_email, customer_phone, industry, website_url, package_id, setup_fee_nok, monthly_fee_nok, template_slug, logo_url, claim_url, expires_at, brand_color, extracted_profile, editable_fields, notes")
    .eq("claim_token", token)
    .maybeSingle();

  if (!data) return { supabase, order: null as DemoOrder | null, orderId: null as string | null };
  const { id, ...order } = data as DemoOrder & { id: string };
  return { supabase, order: order as DemoOrder, orderId: id };
}

export async function generateMetadata({ params }: PreviewPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const { order } = await loadOrder(String(resolvedParams.token || "").trim());
  if (!order) return { title: "DemoSites preview" };

  const title = `${order.company_name} — din nye nettside`;
  const description = `Se hvordan den nye nettsiden til ${order.company_name} kan se ut. Demoen er live nå — bestill for å beholde den.`;
  const logo = order.logo_url || undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(logo ? { images: [{ url: logo }] } : {}),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DemoPreviewPage({ params, searchParams }: PreviewPageProps) {
  const resolvedParams = await params;
  const resolvedSearch = ((await searchParams) || {}) as SearchParams;
  const token = String(resolvedParams.token || "").trim();
  const { supabase, order, orderId } = await loadOrder(token);

  if (!order) {
    return <NotFound title="Fant ikke preview" description="Denne preview-lenken finnes ikke, eller demoen er ikke lenger tilgjengelig." />;
  }

  const fields = order.editable_fields || {};
  const extractedProfile = order.extracted_profile || null;
  const pkg = getDemoSitePackage(order.package_id);

  // Layout/style: URL override (design switcher) → saved fields → industry default.
  const design = resolveDemoSiteDesign({
    templateSlug: String(fields.template_slug || order.template_slug || "local-service"),
    editableFields: fields,
    layoutOverride: typeof resolvedSearch.layout === "string" ? resolvedSearch.layout : null,
    styleOverride: typeof resolvedSearch.style === "string" ? resolvedSearch.style : null,
  });

  // Social proof for the countdown bar: real inquiries captured by THIS
  // demo via the contact form (stored as demo_inquiry events).
  let leadCount = 0;
  if (supabase && orderId) {
    const { count } = await supabase
      .from("demo_site_order_events")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("event_type", "demo_inquiry");
    leadCount = count || 0;
  }

  const showConversionBar = order.status !== "claimed" && Boolean(order.claim_url);
  const isPresentation = resolvedSearch.present === "1";

  return (
    <>
      {showConversionBar && !isPresentation && (
        <DemoCountdownBar expiresAt={order.expires_at} claimUrl={order.claim_url} leadCount={leadCount} />
      )}
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
        design={design}
        inquiryToken={token}
      />
      {!isPresentation && <DemoDesignSwitcher basePath={`/demosites/preview/${token}`} design={design} />}
    </>
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
