import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

function hasText(v: unknown) { return typeof v === "string" && v.trim().length > 0; }
function likelyLanguage(title: string) {
  const t = title.toLowerCase();
  if (/\b(the|your|how|money|works|power|olive|oil|relationship|journey|father|digital|life|premium|growing|psychology|economy|artificial|intelligence|crypto|explained)\b/.test(t)) return "en";
  if (/\b(la|máquina|sospecha|del|de|el)\b/.test(t) || /[áéíóúñ]/i.test(t)) return "es";
  if (/[æøå]/i.test(t) || /\b(og|som|ikke|hvordan|økonomien|psykologien|maktens|lev|kunsten|fra|jord|bord|våpenmakten)\b/.test(t)) return "no";
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [booksRes, seriesRes, channelsRes, membersRes] = await Promise.all([
    supabase.from("book_titles").select("id,slug,title,language,series_id,series_number,amazon_url,cover_image_url,sample_pdf_path,status").eq("status","published").order("title"),
    supabase.from("book_series").select("id,slug,title"),
    supabase.from("book_growth_channel_metadata").select("book_id,channel,external_id,is_active").eq("is_active",true),
    supabase.from("book_growth_work_members").select("book_id,work_id,verified,confidence"),
  ]);
  const error = booksRes.error || seriesRes.error || channelsRes.error || membersRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const books = booksRes.data ?? [];
  const series = seriesRes.data ?? [];
  const channels = channelsRes.data ?? [];
  const members = membersRes.data ?? [];
  const seriesById = new Map(series.map((s:any)=>[String(s.id),s]));
  const memberByBook = new Map(members.map((m:any)=>[String(m.book_id),m]));
  const asinBooks = new Set(channels.filter((c:any)=>c.channel==="amazon" && hasText(c.external_id)).map((c:any)=>String(c.book_id)));

  const ordinalCounts = new Map<string,number>();
  for (const b of books as any[]) if (b.series_id && b.series_number != null) {
    const k = `${b.series_id}:${b.series_number}`; ordinalCounts.set(k,(ordinalCounts.get(k)??0)+1);
  }

  const rows = (books as any[]).map((b:any)=>{
    const issues:string[]=[];
    if (!hasText(b.cover_image_url)) issues.push("missing_cover");
    if (!hasText(b.sample_pdf_path)) issues.push("missing_sample");
    if (!asinBooks.has(String(b.id))) issues.push("missing_asin");
    if (!memberByBook.has(String(b.id))) issues.push("missing_work_link");
    if (b.series_id && b.series_number != null && (ordinalCounts.get(`${b.series_id}:${b.series_number}`)??0)>1) issues.push("duplicate_series_number");
    const guessed=likelyLanguage(String(b.title??""));
    if (guessed && b.language && guessed!==b.language) issues.push("language_review");
    const penalties:Record<string,number>={missing_cover:15,missing_sample:10,missing_asin:20,missing_work_link:20,duplicate_series_number:15,language_review:8};
    const score=Math.max(0,100-issues.reduce((n,x)=>n+(penalties[x]??0),0));
    const s=b.series_id?seriesById.get(String(b.series_id)):null;
    return {bookId:b.id,slug:b.slug,title:b.title,language:b.language,likelyLanguage:guessed,seriesTitle:s?.title??null,seriesSlug:s?.slug??null,seriesNumber:b.series_number,hasCover:hasText(b.cover_image_url),hasSample:hasText(b.sample_pdf_path),hasAsin:asinBooks.has(String(b.id)),hasWork:memberByBook.has(String(b.id)),workVerified:Boolean(memberByBook.get(String(b.id))?.verified),issues,score};
  }).sort((a:any,b:any)=>a.score-b.score || b.issues.length-a.issues.length || String(a.title).localeCompare(String(b.title)));

  const count=(issue:string)=>rows.filter((r:any)=>r.issues.includes(issue)).length;
  const avg=rows.length?Math.round(rows.reduce((n:number,r:any)=>n+r.score,0)/rows.length):0;
  return NextResponse.json({generatedAt:new Date().toISOString(),summary:{totalBooks:rows.length,healthScore:avg,missingCover:count("missing_cover"),missingSample:count("missing_sample"),missingAsin:count("missing_asin"),missingWork:count("missing_work_link"),duplicateSeriesNumber:count("duplicate_series_number"),languageReview:count("language_review"),cleanBooks:rows.filter((r:any)=>r.issues.length===0).length},books:rows});
}
