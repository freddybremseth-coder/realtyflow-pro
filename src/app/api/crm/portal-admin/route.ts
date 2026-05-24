import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function money(value: unknown) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "";
  return `€${num.toLocaleString("nb-NO")}`;
}

function firstText(...values: unknown[]) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function contactBrand(contact: Record<string, unknown>) {
  return firstText(contact.brand_id, contact.brand, "zeneco");
}

function stripHtml(value?: string | null) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function missingColumnFromError(message = "") {
  const match = message.match(/'([^']+)' column|column "([^"]+)"|Could not find the '([^']+)' column/i);
  return match?.[1] || match?.[2] || match?.[3] || "";
}

function tableMissing(message = "", table: string) {
  return new RegExp(`${table}|schema cache|does not exist|not find the table`, "i").test(message);
}

async function updateContactInteractions(supabase: any, contactId: string, interaction: Record<string, unknown>) {
  const { data: freshContact } = await supabase
    .from("contacts")
    .select("interactions")
    .eq("id", contactId)
    .single();

  const interactions = Array.isArray(freshContact?.interactions) ? freshContact.interactions : [];
  await supabase
    .from("contacts")
    .update({
      interactions: [interaction, ...interactions],
      last_contact: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactId);
}

async function insertMarketReportWithFallbacks(supabase: any, payload: Record<string, unknown>) {
  let nextPayload = { ...payload };
  const tried = new Set<string>();

  for (let i = 0; i < 10; i += 1) {
    const { data, error } = await supabase.from("market_reports").insert(nextPayload).select().single();
    if (!error) return { data, error: null };

    const missingColumn = missingColumnFromError(error.message || "");
    if (missingColumn && !tried.has(missingColumn)) {
      tried.add(missingColumn);
      delete nextPayload[missingColumn];
      continue;
    }

    return { data: null, error };
  }

  return { data: null, error: { message: "Kunne ikke lagre dokument etter schema-fallbacks" } };
}

function scoreItem(item: Record<string, unknown>, contact: Record<string, unknown>) {
  const haystack = [
    item.title,
    item.title_no,
    item.title_en,
    item.location,
    item.town,
    item.municipality,
    item.region,
    item.description,
    item.description_no,
    item.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const preferences = [
    contact.preferred_location,
    contact.property_interest,
    contact.interested_in,
    contact.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/[\s,;/.-]+/)
    .filter((word) => word.length > 3);

  let score = 0;
  for (const word of preferences) {
    if (haystack.includes(word)) score += 8;
  }

  const budget = Number(contact.pipeline_value || String(contact.budget || "").replace(/[^0-9]/g, ""));
  const price = Number(item.price || item.price_numeric || 0);
  if (budget && price) {
    if (price <= budget) score += 12;
    else if (price <= budget * 1.15) score += 6;
  }

  return score;
}

function propertyMarkdown(property: Record<string, unknown>, contactName: string) {
  const title = firstText(property.title_no, property.title, property.title_en, property.name, property.ref, "Boligforslag");
  const location = firstText(property.location, property.town, property.municipality, property.region);
  const price = money(property.price || property.price_numeric);
  const bedrooms = firstText(property.bedrooms, property.beds);
  const bathrooms = firstText(property.bathrooms, property.baths);
  const description = stripHtml(firstText(property.description_no, property.description, property.short_description));
  const ref = firstText(property.ref, property.reference, property.id);

  return `# Boligforslag til ${contactName}

## ${title}

${location ? `**Område:** ${location}\n` : ""}${price ? `**Pris:** ${price}\n` : ""}${bedrooms ? `**Soverom:** ${bedrooms}\n` : ""}${bathrooms ? `**Bad:** ${bathrooms}\n` : ""}${ref ? `**Referanse:** ${ref}\n` : ""}

${description || "Dette objektet er lagt til som et aktuelt forslag basert på kundens ønsker. Kontroller detaljer, pris og tilgjengelighet før endelig anbefaling."}

## Hvorfor denne kan passe

- Matcher kundens registrerte område, budsjett eller boligønske.
- Bør vurderes sammen med juridisk kontroll, kostnader, beliggenhet og faktisk bruk.
- Neste steg er å avklare om kunden ønsker mer informasjon, visning eller sammenligning med alternativer.`;
}

function plotMarkdown(plot: Record<string, unknown>, contactName: string) {
  const title = firstText(plot.plot_number, plot.title, plot.name, plot.id, "Tomteforslag");
  const location = firstText(plot.location, plot.municipality);
  const price = money(plot.price);
  const area = Number(plot.area || 0) > 0 ? `${Number(plot.area).toLocaleString("nb-NO")} m²` : "";
  const notes = stripHtml(firstText(plot.notes, plot.description));

  return `# Tomteforslag til ${contactName}

## ${title}

${location ? `**Område:** ${location}\n` : ""}${price ? `**Pris:** ${price}\n` : ""}${area ? `**Tomteareal:** ${area}\n` : ""}

${notes || "Denne tomten er lagt til som et aktuelt forslag basert på kundens ønsker. Kontroller regulering, adkomst, vann, strøm og byggbarhet før anbefaling."}

## Viktige avklaringer

- Regulering og faktisk byggbarhet må bekreftes.
- Vann, strøm, vei og avstand til service bør sjekkes tidlig.
- Kunden bør få tydelig oversikt over totalbudsjett fra tomt til ferdig bolig.`;
}

async function createPortalDocument(
  supabase: any,
  contact: Record<string, unknown>,
  title: string,
  content: string,
  sourceTopic = "CRM Min side",
) {
  const email = normalizeEmail(contact.email as string);
  const now = new Date().toISOString();
  const summary = content.split("\n").find(Boolean)?.replace(/^#+\s*/, "").slice(0, 220) || title;
  const payload = {
    template_id: "crm-portal-document",
    title,
    subtitle: `Publisert til Min side for ${contact.name || email}`,
    summary,
    content_text: content,
    sections: [{ heading: title, content }],
    data_sources: ["RealtyFlow CRM"],
    recipients: "portal_selected",
    sent_to: [email],
    status: "published",
    channel: "portal",
    published_at: now,
    audience_label: String(contact.name || email),
    source_topic: sourceTopic,
    ai_model: "manual-or-crm",
    generated_at: now,
  };

  return insertMarketReportWithFallbacks(supabase, payload);
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const contactId = request.nextUrl.searchParams.get("contactId") || "";
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return NextResponse.json({ error: contactError?.message || "Contact not found" }, { status: 404 });
  }

  const email = normalizeEmail(contact.email);
  if (!email) {
    return NextResponse.json({
      contact,
      portalUser: null,
      messages: [],
      documents: [],
      properties: [],
      plots: [],
      warnings: ["Kunden mangler e-post. Min side krever e-postadresse."],
    });
  }

  const [portalRes, messagesRes, reportsRes, propertiesRes, plotsRes] = await Promise.allSettled([
    supabase.from("portal_users").select("*").eq("contact_id", contactId).maybeSingle(),
    supabase.from("portal_messages").select("*").eq("email", email).order("created_at", { ascending: false }).limit(100),
    supabase
      .from("market_reports")
      .select("id,title,subtitle,summary,content_text,sections,status,channel,recipients,sent_to,published_at,generated_at,created_at")
      .order("generated_at", { ascending: false })
      .limit(200),
    supabase.from("properties").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("land_plots").select("*").order("created_at", { ascending: false }).limit(200),
  ]);

  const warnings: string[] = [];
  const portalResult = portalRes.status === "fulfilled" ? portalRes.value : null;
  if (portalResult?.error && !tableMissing(portalResult.error.message, "portal_users")) warnings.push(portalResult.error.message);

  const messageResult = messagesRes.status === "fulfilled" ? messagesRes.value : null;
  if (messageResult?.error) {
    if (tableMissing(messageResult.error.message, "portal_messages")) warnings.push("portal_messages-tabellen mangler.");
    else warnings.push(messageResult.error.message);
  }

  const reportsResult = reportsRes.status === "fulfilled" ? reportsRes.value : null;
  if (reportsResult?.error) warnings.push(reportsResult.error.message);

  const docs = (reportsResult?.data || []).filter((report: any) => {
    const sentTo = asArray(report.sent_to).map(normalizeEmail);
    const status = report.status || "published";
    const channel = report.channel || "portal";
    return status === "published" && channel === "portal" && (report.recipients === "portal_all" || sentTo.includes(email));
  });

  const propertyRows = propertiesRes.status === "fulfilled" && !propertiesRes.value.error ? propertiesRes.value.data || [] : [];
  const plotRows = plotsRes.status === "fulfilled" && !plotsRes.value.error ? plotsRes.value.data || [] : [];

  const properties = propertyRows
    .map((item: Record<string, unknown>) => ({ ...item, match_score: scoreItem(item, contact) }))
    .sort((a: any, b: any) => Number(b.match_score || 0) - Number(a.match_score || 0))
    .slice(0, 12);

  const plots = plotRows
    .map((item: Record<string, unknown>) => ({ ...item, match_score: scoreItem(item, contact) }))
    .sort((a: any, b: any) => Number(b.match_score || 0) - Number(a.match_score || 0))
    .slice(0, 12);

  return NextResponse.json({
    contact,
    portalUser: portalResult?.data || null,
    messages: messageResult?.data || [],
    documents: docs,
    properties,
    plots,
    warnings,
  });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const contactId = String(body.contactId || "");
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return NextResponse.json({ error: contactError?.message || "Contact not found" }, { status: 404 });
  }

  const email = normalizeEmail(contact.email);
  if (!email) return NextResponse.json({ error: "Kunden mangler e-postadresse." }, { status: 400 });

  const now = new Date().toISOString();

  if (action === "message") {
    const message = String(body.message || "").trim();
    if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("portal_messages")
      .insert({
        contact_id: contact.id,
        email,
        brand_id: contactBrand(contact),
        sender_type: "admin",
        sender_name: "Freddy Bremseth",
        body: message,
        attachments: [],
        read_by_admin_at: now,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await updateContactInteractions(supabase, contact.id, {
      id: `portal_admin_${Date.now()}`,
      type: "note",
      source: "min-side",
      direction: "out",
      date: now.split("T")[0],
      content: `Melding sendt til Min side:\n${message}`,
    });

    return NextResponse.json({ success: true, message: data }, { status: 201 });
  }

  if (action === "publish_document") {
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    if (!title || !content) return NextResponse.json({ error: "title and content are required" }, { status: 400 });

    const { data, error } = await createPortalDocument(supabase, contact, title, content, String(body.sourceTopic || "CRM Min side"));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await updateContactInteractions(supabase, contact.id, {
      id: `portal_doc_${Date.now()}`,
      type: "note",
      source: "min-side",
      direction: "out",
      date: now.split("T")[0],
      content: `Dokument publisert på Min side: ${title}`,
    });

    return NextResponse.json({ success: true, document: data }, { status: 201 });
  }

  if (action === "share_property" || action === "share_plot") {
    const itemId = String(body.itemId || "");
    if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

    const table = action === "share_property" ? "properties" : "land_plots";
    const { data: item, error: itemError } = await supabase.from(table).select("*").eq("id", itemId).single();
    if (itemError || !item) {
      return NextResponse.json({ error: itemError?.message || "Item not found" }, { status: 404 });
    }

    const isProperty = action === "share_property";
    const titleBase = isProperty
      ? firstText(item.title_no, item.title, item.name, item.ref, "Boligforslag")
      : firstText(item.plot_number, item.title, item.name, "Tomteforslag");
    const title = `${isProperty ? "Boligforslag" : "Tomteforslag"}: ${titleBase}`;
    const content = isProperty ? propertyMarkdown(item, contact.name || email) : plotMarkdown(item, contact.name || email);

    const { data, error } = await createPortalDocument(supabase, contact, title, content, isProperty ? "CRM boligforslag" : "CRM tomteforslag");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const message = `${isProperty ? "Jeg har lagt et boligforslag" : "Jeg har lagt et tomteforslag"} på Min side for deg: ${titleBase}. Se dokumentet og gi meg gjerne beskjed om dette er riktig retning.`;
    await supabase.from("portal_messages").insert({
      contact_id: contact.id,
      email,
      brand_id: contactBrand(contact),
      sender_type: "admin",
      sender_name: "Freddy Bremseth",
      body: message,
      attachments: [],
      read_by_admin_at: now,
    }).then(() => null);

    await updateContactInteractions(supabase, contact.id, {
      id: `portal_share_${Date.now()}`,
      type: "note",
      source: "min-side",
      direction: "out",
      date: now.split("T")[0],
      content: `${isProperty ? "Boligforslag" : "Tomteforslag"} publisert på Min side: ${titleBase}`,
    });

    return NextResponse.json({ success: true, document: data }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
