export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireCronApi } from "@/lib/api-cron";
import { propertyMatchesBrand } from "@/lib/realty/brand-rules";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { sendBrandEmail } from "@/services/email/send-brand-email";

function numberValue(value: unknown) {
  const parsed = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchesCriteria(property: any, criteria: Record<string, any>) {
  const areaNeedle = String(criteria.area || criteria.region || "").trim().toLowerCase();
  const maxPrice = numberValue(criteria.budgetMax);
  const minPrice = numberValue(criteria.budgetMin);
  const minBedrooms = numberValue(criteria.bedrooms);
  const minBathrooms = numberValue(criteria.bathrooms);
  const typeNeedle = String(criteria.propertyType || "").trim().toLowerCase();
  const lifestyle = String(criteria.lifestyle || "").trim().toLowerCase();

  const locationText = [property.location, property.town, property.municipality, property.area, property.title_no, property.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (areaNeedle && !locationText.includes(areaNeedle)) return false;
  if (maxPrice && Number(property.price || 0) > maxPrice) return false;
  if (minPrice && Number(property.price || 0) < minPrice) return false;
  if (minBedrooms && Number(property.bedrooms || 0) < minBedrooms) return false;
  if (minBathrooms && Number(property.bathrooms || 0) < minBathrooms) return false;
  if (typeNeedle && !String(property.property_type || property.type || "").toLowerCase().includes(typeNeedle)) return false;
  if (lifestyle === "pool" && !property.pool) return false;
  if (lifestyle === "sea" && !/sea|sjø|hav|beach|strand/i.test(locationText + " " + String(property.description_no || ""))) return false;
  if (lifestyle === "golf" && !/golf/i.test(locationText + " " + String(property.description_no || ""))) return false;
  return true;
}

async function handle(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: searches, error: searchError } = await supabase
    .from("portal_saved_searches")
    .select("id,contact_id,brand_id,criteria,alerts_enabled,last_checked_at,last_notified_at")
    .eq("brand_id", "zeneco")
    .eq("alerts_enabled", true)
    .order("updated_at", { ascending: true })
    .limit(200);

  if (searchError) return NextResponse.json({ error: searchError.message }, { status: 500 });

  let checked = 0;
  let notified = 0;
  let matchedProperties = 0;
  const failures: string[] = [];

  for (const search of searches || []) {
    checked += 1;
    const since = search.last_checked_at || new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { data: contact } = await supabase
      .from("contacts")
      .select("id,name,email,brand_id,brand,pipeline_status,email_suppressed,do_not_contact")
      .eq("id", search.contact_id)
      .maybeSingle();

    if (!contact?.email || contact.email_suppressed || contact.do_not_contact || String(contact.pipeline_status || "").toUpperCase() === "LOST") {
      await supabase.from("portal_saved_searches").update({ last_checked_at: nowIso, updated_at: nowIso }).eq("id", search.id);
      continue;
    }

    const { data: properties, error: propertyError } = await supabase
      .from("properties")
      .select("id,ref,title,title_no,location,town,municipality,area,price,bedrooms,bathrooms,property_type,type,pool,primary_image,show_on_website,website_visible,brand_id,brand,created_at,description_no")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(250);

    if (propertyError) {
      failures.push(`${search.id}: ${propertyError.message}`);
      continue;
    }

    const matches = (properties || [])
      .filter((property: any) => property.show_on_website !== false && property.website_visible !== false)
      .filter((property: any) => propertyMatchesBrand(property, "zeneco"))
      .filter((property: any) => matchesCriteria(property, (search.criteria || {}) as Record<string, any>))
      .slice(0, 5);

    matchedProperties += matches.length;

    if (matches.length) {
      const firstName = String(contact.name || "").trim().split(/\s+/)[0] || "Hei";
      const lines = matches.map((property: any) => {
        const title = property.title_no || property.title || property.ref || "Bolig";
        const price = property.price
          ? new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(property.price))
          : "Pris på forespørsel";
        const url = `https://www.zenecohomes.com/eiendommer/${encodeURIComponent(property.ref || property.id)}`;
        return `${title} · ${property.location || property.town || "Spania"} · ${price}\n${url}`;
      });

      const bodyText = `Hei ${firstName},\n\nVi har funnet ${matches.length} nye ${matches.length === 1 ? "bolig" : "boliger"} som matcher søket ditt på Min side.\n\n${lines.join("\n\n")}\n\nDu kan endre kriteriene eller slå av varsler når som helst på Min side:\nhttps://www.zenecohomes.com/min-side\n\nMed vennlig hilsen\nZen Eco Homes`;
      const bodyHtml = `<p>Hei ${firstName},</p><p>Vi har funnet <strong>${matches.length} nye ${matches.length === 1 ? "bolig" : "boliger"}</strong> som matcher søket ditt på Min side.</p><ul>${matches.map((property: any) => {
        const title = property.title_no || property.title || property.ref || "Bolig";
        const price = property.price
          ? new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(property.price))
          : "Pris på forespørsel";
        const url = `https://www.zenecohomes.com/eiendommer/${encodeURIComponent(property.ref || property.id)}`;
        return `<li style="margin-bottom:12px;"><a href="${url}"><strong>${title}</strong></a><br>${property.location || property.town || "Spania"} · ${price}</li>`;
      }).join("")}</ul><p><a href="https://www.zenecohomes.com/min-side">Åpne Min side</a> for å endre kriteriene eller slå av varsler.</p><p>Med vennlig hilsen<br>Zen Eco Homes</p>`;

      const result = await sendBrandEmail(supabase, {
        brandId: "zeneco",
        to: [String(contact.email).toLowerCase()],
        subject: `${matches.length} nye ${matches.length === 1 ? "bolig" : "boliger"} matcher søket ditt | Zen Eco Homes`,
        bodyText,
        bodyHtml,
      });

      if (result.success) {
        notified += 1;
        await supabase
          .from("portal_saved_searches")
          .update({ last_checked_at: nowIso, last_notified_at: nowIso, updated_at: nowIso })
          .eq("id", search.id);
      } else {
        failures.push(`${search.id}: ${result.error || "email send failed"}`);
      }
    } else {
      await supabase.from("portal_saved_searches").update({ last_checked_at: nowIso, updated_at: nowIso }).eq("id", search.id);
    }
  }

  return NextResponse.json({ success: true, checked, notified, matchedProperties, failures });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
