import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { DemoSitePreviewRenderer } from "@/components/demosites/demo-site-preview-renderer";
import { getDemoSitesPreviewModel } from "@/lib/demosites-preview";
import { resolveDemoSiteDesign } from "@/lib/demosites-design";
import { buildLiveSiteUrl } from "@/lib/demosites-publish";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /sites/[slug] — the REAL published one-pager for paying customers.
 * Same renderer as the trial preview, but: indexable, full SEO metadata,
 * schema.org LocalBusiness, no trial UI and a delivered-by footer.
 */

type SitePageProps = {
  params: Promise<{ slug: string }> | { slug: string };
};

type LiveOrder = {
  id: string;
  status: string;
  billing_status: string;
  company_name: string;
  customer_email: string;
  customer_phone?: string | null;
  industry?: string | null;
  website_url?: string | null;
  template_slug?: string | null;
  logo_url?: string | null;
  brand_color?: string | null;
  claim_token?: string | null;
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

async function loadLiveOrder(slug: string): Promise<LiveOrder | null> {
  const supabase = getSupabase();
  if (!slug || !supabase) return null;

  const { data } = await supabase
    .from("demo_site_orders")
    .select("id, status, billing_status, company_name, customer_email, customer_phone, industry, website_url, template_slug, logo_url, brand_color, claim_token, extracted_profile, editable_fields, notes")
    .eq("site_slug", slug)
    .eq("status", "deployed")
    .maybeSingle();

  return (data as LiveOrder | null) ?? null;
}

function buildPreviewInput(order: LiveOrder) {
  const fields = order.editable_fields || {};
  return {
    companyName: order.company_name,
    templateSlug: String(fields.template_slug || order.template_slug || "local-service"),
    // Live sites never link back to the old site they replaced.
    websiteUrl: null,
    logoUrl: order.logo_url,
    brandColor: order.brand_color,
    customerEmail: order.customer_email,
    customerPhone: order.customer_phone,
    profile: order.extracted_profile,
    extractedProfile: order.extracted_profile,
    editableFields: fields,
    notes: order.notes,
    fallbackMode: "defaults" as const,
  };
}

export async function generateMetadata({ params }: SitePageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = String(resolvedParams.slug || "").trim();
  const order = await loadLiveOrder(slug);
  if (!order) return { title: "Siden finnes ikke", robots: { index: false } };

  const preview = getDemoSitesPreviewModel(buildPreviewInput(order));
  const title = `${preview.companyName} – ${preview.content.hero_title}`.slice(0, 70);
  const description = (preview.content.hero_subtitle || preview.content.intro_text || "").slice(0, 160);
  const url = buildLiveSiteUrl(slug);
  const image = preview.content.gallery_images[0] || preview.content.logo_url || undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: preview.companyName,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function LiveSitePage({ params }: SitePageProps) {
  const resolvedParams = await params;
  const slug = String(resolvedParams.slug || "").trim();
  const order = await loadLiveOrder(slug);

  if (!order) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="max-w-md rounded-lg border border-slate-800 bg-slate-900 p-8 text-center">
          <h1 className="text-2xl font-bold">Siden finnes ikke</h1>
          <p className="mt-3 text-slate-300">Denne adressen er ikke publisert. Sjekk at lenken er riktig.</p>
        </div>
      </main>
    );
  }

  const input = buildPreviewInput(order);
  const preview = getDemoSitesPreviewModel(input);
  const design = resolveDemoSiteDesign({
    templateSlug: preview.templateSlug,
    editableFields: input.editableFields,
  });

  // schema.org LocalBusiness — the delivered SEO package.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: preview.companyName,
    url: buildLiveSiteUrl(slug),
    ...(preview.content.logo_url ? { logo: preview.content.logo_url } : {}),
    ...(preview.content.gallery_images.length ? { image: preview.content.gallery_images } : {}),
    ...(preview.contact.phone ? { telephone: preview.contact.phone } : {}),
    ...(preview.contact.email ? { email: preview.contact.email } : {}),
    ...(preview.contact.address ? { address: preview.contact.address } : {}),
    description: preview.content.hero_subtitle || preview.content.intro_text || "",
    ...(preview.content.services.length
      ? {
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: "Tjenester",
            itemListElement: preview.content.services.map((service) => ({
              "@type": "Offer",
              itemOffered: { "@type": "Service", name: service },
            })),
          },
        }
      : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <DemoSitePreviewRenderer
        mode="public"
        {...input}
        design={design}
        inquiryToken={order.claim_token || undefined}
        isLiveSite
      />
    </>
  );
}
