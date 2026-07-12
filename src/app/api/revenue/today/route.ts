import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { normalizeBrandId } from "@/lib/realty/brand-rules";
import {
  buildRevenuePriority,
  sortRevenuePriorities,
  type RevenueMemoryEventInput,
  type RevenuePriorityItem,
} from "@/lib/revenue/today";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACTIVE_STAGES = ["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "ON_HOLD"];
const REAL_ESTATE_BRANDS = new Set(["zeneco", "soleada", "pinosoecolife"]);
const REVENUE_WORK_SOURCES = new Set(["crm", "website_lead", "chatbot", "property", "lead_intelligence"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function emptyPayload() {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      activeLeads: 0,
      newLeads: 0,
      overdueFollowups: 0,
      hotSignals: 0,
      closingOpportunities: 0,
      missingNextAction: 0,
      totalPipelineValue: 0,
      openWorkItems: 0,
    },
    priorities: [] as RevenuePriorityItem[],
    workItems: [] as Array<Record<string, unknown>>,
    warnings: [] as string[],
  };
}

function workItemHref(sourceType: string) {
  if (["crm", "website_lead", "chatbot", "lead_intelligence"].includes(sourceType)) return "/pipeline";
  if (sourceType === "property") return "/inventory";
  return "/marketing-tasks";
}

function normalizeWorkItem(item: Record<string, any>) {
  const sourceType = String(item.source_type || "manual").toLowerCase();
  return {
    id: String(item.id),
    title: String(item.title || "Oppgave uten tittel"),
    description: item.description ? String(item.description) : null,
    status: String(item.status || "TO_DO"),
    priority: String(item.priority || "MEDIUM"),
    dueAt: item.due_date || null,
    brandId: normalizeBrandId(item.brand_id || item.brand) || null,
    sourceType,
    sourceId: item.source_id || null,
    nextAction: item.next_action ? String(item.next_action) : null,
    aiScore: Number(item.ai_score || 0),
    href: workItemHref(sourceType),
  };
}

function priorityWeight(value: string) {
  if (value === "CRITICAL") return 4;
  if (value === "HIGH") return 3;
  if (value === "MEDIUM") return 2;
  return 1;
}

function missingRevenueEventsTable(message = "") {
  return /revenue_events|schema cache|does not exist|relation/i.test(message);
}

export async function GET(request: NextRequest) {
  const fallback = emptyPayload();
  const adminError = await requireAdminApi(request, fallback);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({
      ...fallback,
      warnings: ["Supabase er ikke konfigurert for Revenue Inbox."],
    });
  }

  const [contactsResult, workItemsResult] = await Promise.all([
    supabase
      .from("contacts")
      .select("*")
      .in("pipeline_status", ACTIVE_STAGES)
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("work_items")
      .select("*")
      .in("status", ["TO_DO", "IN_PROGRESS", "REVIEW"])
      .order("ai_score", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);

  const warnings: string[] = [];
  if (contactsResult.error) warnings.push(`Kontakter: ${contactsResult.error.message}`);
  if (workItemsResult.error && !/work_items|schema cache|does not exist|relation/i.test(workItemsResult.error.message)) {
    warnings.push(`Oppgaver: ${workItemsResult.error.message}`);
  }

  const now = new Date();
  const contacts = contactsResult.data || [];
  const contactIds = contacts.map((contact) => String(contact.id || "")).filter(Boolean);
  const eventsByContact = new Map<string, RevenueMemoryEventInput[]>();

  if (contactIds.length) {
    const eventsResult = await supabase
      .from("revenue_events")
      .select("id,event_type,title,description,contact_id,actor_type,occurred_at,metadata,created_at")
      .in("contact_id", contactIds)
      .order("occurred_at", { ascending: false })
      .limit(1000);

    if (eventsResult.error) {
      if (!missingRevenueEventsTable(eventsResult.error.message)) {
        warnings.push(`Revenue memory: ${eventsResult.error.message}`);
      }
    } else {
      for (const event of eventsResult.data || []) {
        const contactId = String(event.contact_id || "");
        if (!contactId) continue;
        const bucket = eventsByContact.get(contactId) || [];
        bucket.push(event);
        eventsByContact.set(contactId, bucket);
      }
    }
  }

  const priorities = sortRevenuePriorities(
    contacts
      .map((contact) => buildRevenuePriority(contact, now, { revenueEvents: eventsByContact.get(String(contact.id || "")) || [] }))
      .filter((item): item is RevenuePriorityItem => Boolean(item)),
  );

  const workItems = (workItemsResult.data || [])
    .map(normalizeWorkItem)
    .filter((item) => {
      const brandMatches = item.brandId ? REAL_ESTATE_BRANDS.has(item.brandId) : false;
      return brandMatches || REVENUE_WORK_SOURCES.has(item.sourceType);
    })
    .sort((a, b) => {
      const priorityDelta = priorityWeight(b.priority) - priorityWeight(a.priority);
      if (priorityDelta !== 0) return priorityDelta;
      if (b.aiScore !== a.aiScore) return b.aiScore - a.aiScore;
      return String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999"));
    })
    .slice(0, 30);

  const summary = {
    activeLeads: priorities.length,
    newLeads: priorities.filter((item) => item.kind === "new").length,
    overdueFollowups: priorities.filter((item) => item.isOverdue).length,
    hotSignals: priorities.filter((item) => item.score >= 75).length,
    closingOpportunities: priorities.filter((item) => item.kind === "closing").length,
    missingNextAction: priorities.filter((item) => item.isMissingNextAction).length,
    totalPipelineValue: priorities.reduce((sum, item) => sum + item.value, 0),
    openWorkItems: workItems.length,
  };

  return NextResponse.json({
    generatedAt: now.toISOString(),
    summary,
    priorities: priorities.slice(0, 100),
    workItems,
    warnings,
  });
}
