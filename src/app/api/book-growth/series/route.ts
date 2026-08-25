import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function text(v: unknown) {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const x = v as Record<string, unknown>;
    return String(x.en ?? x.no ?? x.es ?? Object.values(x)[0] ?? "");
  }
  return "";
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const [seriesRes, booksRes, channelRes, metricsRes, eventsRes] = await Promise.all([
    supabase.from("book_series").select("id,slug,title,book_count,sort_order"),
    supabase.from("book_titles").select("id,slug,title,series_id,series_number,status,cover_image_url,sample_pdf_path").eq("status", "published"),
    supabase.from("book_growth_channel_metadata").select("book_id,channel,external_id,is_active").eq("channel", "amazon").eq("is_active", true),
    supabase.from("book_growth_metrics").select("book_id,metric_date,royalties,units,pages_read,ad_spend,ad_sales").gte("metric_date", since.slice(0,10)),
    supabase.from("book_growth_events").select("book_id,series_id,event_type,occurred_at").gte("occurred_at", since),
  ]);
  const error = seriesRes.error || booksRes.error || channelRes.error || metricsRes.error || eventsRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const books = booksRes.data ?? [];
  const channels = channelRes.data ?? [];
  const metrics = metricsRes.data ?? [];
  const events = eventsRes.data ?? [];
  const asinByBook = new Set(channels.filter((r:any)=>r.external_id).map((r:any)=>String(r.book_id)));

  const metricByBook = new Map<string, { royalties:number; units:number; pages:number; spend:number; adSales:number }>();
  for (const r of metrics as any[]) {
    const k=String(r.book_id); const m=metricByBook.get(k) ?? {royalties:0,units:0,pages:0,spend:0,adSales:0};
    m.royalties += Number(r.royalties||0); m.units += Number(r.units||0); m.pages += Number(r.pages_read||0); m.spend += Number(r.ad_spend||0); m.adSales += Number(r.ad_sales||0); metricByBook.set(k,m);
  }
  const eventBySeries = new Map<string, Record<string,number>>();
  for (const r of events as any[]) {
    const k = r.series_id ? String(r.series_id) : ""; if (!k) continue;
    const e=eventBySeries.get(k) ?? {}; e[r.event_type]=(e[r.event_type]??0)+1; eventBySeries.set(k,e);
  }

  const series = (seriesRes.data ?? []).map((s:any)=>{
    const members = books.filter((b:any)=>String(b.series_id)===String(s.id)).sort((a:any,b:any)=>(a.series_number??999)-(b.series_number??999));
    let royalties=0, units=0, pagesRead=0, adSpend=0, adSales=0;
    for (const b of members) { const m=metricByBook.get(String(b.id)); if (!m) continue; royalties+=m.royalties; units+=m.units; pagesRead+=m.pages; adSpend+=m.spend; adSales+=m.adSales; }
    const asinLinked = members.filter((b:any)=>asinByBook.has(String(b.id))).length;
    const samples = members.filter((b:any)=>Boolean(b.sample_pdf_path)).length;
    const covers = members.filter((b:any)=>Boolean(b.cover_image_url)).length;
    const ev = eventBySeries.get(String(s.id)) ?? {};
    const bookViews=ev.book_view??0, seriesClicks=ev.series_to_book_click??0, amazonClicks=ev.amazon_click??0, sampleClicks=ev.sample_click??0;
    const entry = members[0] ?? null;
    const entryMetrics = entry ? metricByBook.get(String(entry.id)) : null;
    const downstreamUnits = members.slice(1).reduce((sum:number,b:any)=>sum+(metricByBook.get(String(b.id))?.units??0),0);
    const estimatedReadthrough = entryMetrics?.units ? downstreamUnits / entryMetrics.units : null;
    const roas = adSpend > 0 ? adSales / adSpend : null;
    const catalogGap = Math.max(0, members.length-asinLinked)*3 + Math.max(0,members.length-samples) + Math.max(0,members.length-covers);
    const demand = bookViews + seriesClicks*3 + amazonClicks*6 + sampleClicks*4;
    const economics = Math.min(royalties,100) + Math.min(units*2,100) + (roas !== null && roas < 1 ? 20 : 0);
    const opportunityScore = Math.round(demand + catalogGap + economics);
    return {
      id:s.id, slug:s.slug, title:text(s.title), books:members.length, asinLinked, samples, covers,
      royalties90d:Number(royalties.toFixed(2)), units90d:Number(units.toFixed(2)), pagesRead90d:pagesRead,
      adSpend90d:Number(adSpend.toFixed(2)), adSales90d:Number(adSales.toFixed(2)), roas:roas===null?null:Number(roas.toFixed(2)),
      events90d:{bookViews,seriesClicks,amazonClicks,sampleClicks}, estimatedReadthrough:estimatedReadthrough===null?null:Number(estimatedReadthrough.toFixed(2)),
      entryBook: entry ? { id:entry.id, title:entry.title, slug:entry.slug, seriesNumber:entry.series_number, asinLinked:asinByBook.has(String(entry.id)) } : null,
      opportunityScore,
      booksDetail: members.map((b:any)=>({ id:b.id,title:b.title,slug:b.slug,seriesNumber:b.series_number,asinLinked:asinByBook.has(String(b.id)),metrics:metricByBook.get(String(b.id))??null }))
    };
  }).sort((a:any,b:any)=>b.opportunityScore-a.opportunityScore || b.books-a.books);

  return NextResponse.json({ generatedAt:new Date().toISOString(), windowDays:90, series });
}
