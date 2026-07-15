/**
 * DemoSites publishing — the delivery moment.
 *
 * A paid order becomes a real, indexable website at /sites/<slug>, served
 * by the same renderer as the trial preview but without any trial UI
 * (no countdown, no style switcher, no "existing site" links). Publishing
 * happens automatically from the Stripe webhook the second the payment
 * lands, and can be (re)triggered manually from the CRM.
 *
 * The base URL is configurable: set DEMOSITES_SITES_BASE_URL (e.g.
 * https://sider.chatgenius.pro once that domain is added to the Vercel
 * project) — no code change needed to move the public URL later.
 */

import { slugifyCompanyName } from "@/lib/demosites";
import {
  buildSubdomainUrl,
  isReservedSubdomain,
  isSubdomainProvisioningConfigured,
  provisionCustomerSubdomain,
} from "@/lib/demosites-domains";
import { sendBrandEmail } from "@/services/email/send-brand-email";

type SupabaseLike = { from: (table: string) => any };

const SITES_BASE_URL =
  process.env.DEMOSITES_SITES_BASE_URL ||
  process.env.NEXT_PUBLIC_REALTYFLOW_URL ||
  "https://realtyflow.chatgenius.pro";

const EMAIL_BRAND_ID = process.env.DEMOSITES_EMAIL_BRAND_ID || "chatgenius";

export function buildLiveSiteUrl(slug: string): string {
  return `${SITES_BASE_URL}/sites/${slug}`;
}

export type PublishResult = {
  ok: boolean;
  siteSlug?: string;
  productionUrl?: string;
  error?: string;
};

function isInternalImportEmail(value: string) {
  return /^demosites-import\+[^@\s]+@chatgenius\.pro$/i.test(value.trim());
}

/** Find a slug that is free or already belongs to this order. */
async function ensureSiteSlug(supabase: SupabaseLike, orderId: string, companyName: string): Promise<string> {
  const base = slugifyCompanyName(companyName) || `side-${orderId.slice(0, 8)}`;

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data: existing } = await supabase
      .from("demo_site_orders")
      .select("id")
      .eq("site_slug", candidate)
      .maybeSingle();
    if (!existing || existing.id === orderId) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Publish one order. Requires payment unless `force` (CRM override for
 * manually invoiced customers). Idempotent — republishing keeps the slug.
 */
export async function publishDemoSiteOrder(
  supabase: SupabaseLike,
  orderId: string,
  options: { force?: boolean } = {},
): Promise<PublishResult> {
  const { data: order } = await supabase
    .from("demo_site_orders")
    .select("id, company_name, customer_name, customer_email, billing_status, status, site_slug, production_url")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "Order not found" };
  if (order.billing_status !== "paid" && !options.force) {
    return { ok: false, error: "Ordren er ikke betalt. Bruk force for manuelt fakturerte kunder." };
  }

  const siteSlug = order.site_slug || (await ensureSiteSlug(supabase, order.id, order.company_name));
  const firstPublish = !order.site_slug || order.status !== "deployed";

  // Preferred address: <slug>.chatgenius.pro (auto-provisioned via Vercel +
  // Hostinger DNS). Falls back to the /sites path when tokens are missing
  // or provisioning fails — publishing must never block on DNS.
  let productionUrl = buildLiveSiteUrl(siteSlug);
  let subdomainNote = "";
  if (isSubdomainProvisioningConfigured() && !isReservedSubdomain(siteSlug)) {
    const provisioned = await provisionCustomerSubdomain(siteSlug);
    if (provisioned.ok && provisioned.url) {
      productionUrl = provisioned.url;
    } else {
      subdomainNote = ` (subdomene feilet: ${provisioned.error} — bruker /sites-adressen)`;
      console.warn("[DemoSites Publish] Subdomain provisioning failed:", provisioned.error);
    }
  }

  const { error: updateError } = await supabase
    .from("demo_site_orders")
    .update({
      site_slug: siteSlug,
      production_url: productionUrl,
      status: "deployed",
      deployment_target: SITES_BASE_URL.replace(/^https?:\/\//, ""),
    })
    .eq("id", order.id);

  if (updateError) {
    const missingColumn = /site_slug/.test(updateError.message);
    return {
      ok: false,
      error: missingColumn
        ? "Kjør migrasjonen 20260715120000_demosites_publishing.sql i Supabase først."
        : updateError.message,
    };
  }

  try {
    await supabase.from("demo_site_order_events").insert({
      order_id: order.id,
      event_type: "demo_published",
      title: firstPublish ? "Nettsiden er publisert" : "Nettsiden er republisert",
      description: `${order.company_name} er live på ${productionUrl}${subdomainNote}`,
      metadata: { site_slug: siteSlug, production_url: productionUrl, forced: Boolean(options.force) },
    });
  } catch {
    // Event logging is best-effort.
  }

  // Tell the customer their site is live (best effort, never blocks publish).
  const email = String(order.customer_email || "");
  if (firstPublish && email && !isInternalImportEmail(email)) {
    const name = (order.customer_name || order.company_name).split(" ")[0];
    await sendBrandEmail(supabase as never, {
      brandId: EMAIL_BRAND_ID,
      to: [email],
      subject: `🎉 Nettsiden til ${order.company_name} er live!`,
      bodyText: `Hei ${name},

Gratulerer — den nye nettsiden deres er publisert og live:

${productionUrl}

Del lenken med kunder, legg den i Google-profilen deres og bruk den i signaturen. Vi drifter siden for dere med hosting, SSL og månedlige justeringer.

Som DemoSites-kunde har dere også:
- 30 min gratis samtale der vi analyserer bedriften og foreslår tilpasninger: https://appointment.chatgenius.pro/booking.html?brand=chat
- 60 % rabatt på utviklertimer — 596 kr/t (ordinært 1 490 kr/t)
- SEO & Google-optimalisering som tillegg for 490 kr (engangsbeløp)

Vil du endre tekst, bilder eller innhold? Svar på denne e-posten, så fikser vi det.

Vennlig hilsen
ChatGenius.pro`,
    }).catch((err) => {
      console.warn("[DemoSites Publish] Live email failed:", err instanceof Error ? err.message : err);
      return { success: false as const };
    });
  }

  return { ok: true, siteSlug, productionUrl };
}
