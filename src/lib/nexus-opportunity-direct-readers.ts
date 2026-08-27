import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRevenuePriority,
  sortRevenuePriorities,
  type RevenueContactInput,
  type RevenueMemoryEventInput,
} from "@/lib/revenue/today";
import type { DemoSiteEventInput, DemoSiteOrderInput } from "@/lib/nexus-ai-demosites-adapter";

const ACTIVE_REAL_ESTATE_STAGES = ["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "ON_HOLD"];

type RevenueEventRow = RevenueMemoryEventInput & { contact_id?: string | null };

export function realEstateOpportunityPayloadFromRows(
  contacts: RevenueContactInput[],
  events: RevenueEventRow[],
  now = new Date(),
) {
  const eventsByContact = new Map<string, RevenueMemoryEventInput[]>();
  for (const event of events) {
    const contactId = String(event.contact_id || "");
    if (!contactId) continue;
    const bucket = eventsByContact.get(contactId) || [];
    bucket.push(event);
    eventsByContact.set(contactId, bucket);
  }

  return {
    priorities: sortRevenuePriorities(
      contacts
        .map((contact) => buildRevenuePriority(contact, now, {
          revenueEvents: eventsByContact.get(String(contact.id || "")) || [],
        }))
        .filter((item): item is NonNullable<ReturnType<typeof buildRevenuePriority>> => Boolean(item)),
    ),
  };
}

export function aiDemositesOpportunityPayloadFromRows(
  orders: DemoSiteOrderInput[],
  events: DemoSiteEventInput[],
) {
  return { orders, events };
}

export async function loadRealEstateOpportunityPayload(supabase: SupabaseClient, now = new Date()) {
  const contactsResult = await supabase
    .from("contacts")
    .select("*")
    .in("pipeline_status", ACTIVE_REAL_ESTATE_STAGES)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (contactsResult.error) throw new Error(`Revenue Today contacts: ${contactsResult.error.message}`);

  const contacts = (contactsResult.data || []) as RevenueContactInput[];
  const contactIds = contacts.map((contact) => String(contact.id || "")).filter(Boolean);
  let events: RevenueEventRow[] = [];

  if (contactIds.length) {
    const eventsResult = await supabase
      .from("revenue_events")
      .select("event_type,title,description,source_system,source_type,occurred_at,created_at,metadata,contact_id")
      .in("contact_id", contactIds)
      .order("occurred_at", { ascending: false })
      .limit(1000);

    if (eventsResult.error) {
      const message = eventsResult.error.message || "";
      if (!/revenue_events|schema cache|does not exist|relation/i.test(message)) {
        throw new Error(`Revenue Today events: ${message}`);
      }
    } else {
      events = (eventsResult.data || []) as RevenueEventRow[];
    }
  }

  return realEstateOpportunityPayloadFromRows(contacts, events, now);
}

export async function loadAiDemositesOpportunityPayload(supabase: SupabaseClient) {
  const [ordersResult, eventsResult] = await Promise.all([
    supabase
      .from("demo_site_orders")
      .select("id,status,billing_status,customer_name,customer_email,customer_phone,company_name,package_id,setup_fee_nok,monthly_fee_nok,currency,preview_url,claim_url,expires_at,claimed_at,approved_at,deployed_at,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("demo_site_order_events")
      .select("id,order_id,event_type,title,description,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  if (ordersResult.error) throw new Error(`DemoSites orders: ${ordersResult.error.message}`);
  if (eventsResult.error) throw new Error(`DemoSites events: ${eventsResult.error.message}`);

  return aiDemositesOpportunityPayloadFromRows(
    (ordersResult.data || []) as DemoSiteOrderInput[],
    (eventsResult.data || []) as DemoSiteEventInput[],
  );
}
