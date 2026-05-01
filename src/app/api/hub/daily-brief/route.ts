import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorkItem = {
  id: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  source_type?: string | null;
  next_action?: string | null;
  ai_score?: number | null;
  due_date?: string | null;
};

function originFromEnv() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin || originFromEnv();
  const res = await fetch(`${origin}/api/work-items?limit=25`, {
    headers: { cookie: request.headers.get("cookie") || "" },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ work_items: [] }));
  const items = (data.work_items || []) as WorkItem[];
  const openItems = items.filter((item) => !["DONE", "CANCELLED"].includes(String((item as any).status || "")));
  const sorted = openItems.sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0)).slice(0, 7);

  const counts = sorted.reduce<Record<string, number>>((acc, item) => {
    const key = item.source_type || "manual";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const risks = sorted
    .filter((item) => ["CRITICAL", "HIGH"].includes(String(item.priority || "")))
    .slice(0, 4)
    .map((item) => ({
      title: item.title,
      reason: item.description || item.next_action || "Høy prioritet i HUB-en.",
      source_type: item.source_type,
    }));

  const opportunities = sorted
    .filter((item) => ["crm", "website_lead", "chatbot", "saas", "market_intelligence"].includes(String(item.source_type || "")))
    .slice(0, 4)
    .map((item) => ({
      title: item.title,
      next_action: item.next_action || "Vurder neste beste handling.",
      score: item.ai_score || 0,
    }));

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    summary: sorted.length
      ? `Victoria fant ${sorted.length} prioriterte handlinger. Viktigst nå: ${sorted[0]?.title}.`
      : "Ingen kritiske handlinger funnet akkurat nå.",
    top_priorities: sorted.map((item, index) => ({
      rank: index + 1,
      id: item.id,
      title: item.title,
      description: item.description,
      priority: item.priority || "MEDIUM",
      source_type: item.source_type || "manual",
      next_action: item.next_action || "Se detaljer og vurder neste steg.",
      ai_score: item.ai_score || 0,
      due_date: item.due_date,
    })),
    recommended_tasks: sorted.slice(0, 5),
    risks,
    opportunities,
    source_counts: counts,
    synthetic: Boolean(data.synthetic),
    table_not_ready: Boolean(data.tableNotReady),
  });
}
