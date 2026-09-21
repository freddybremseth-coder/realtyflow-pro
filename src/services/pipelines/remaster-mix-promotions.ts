import { createClient } from '@supabase/supabase-js';

export type PromotionBrand = 'zeneco' | 'art' | 'books' | 'none';
export type PromotionItem = {
  id: string; title: string; imageUrl: string; detailUrl: string;
  style?: string; collection?: string; series?: string; language?: string;
};

const ART_PATH = /^[a-z0-9][a-z0-9-]{0,120}\/view\.webp$/i;
const SAFE_BOOK_PATH = /^\/?assets\/covers\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,180}\.(?:png|jpe?g|webp)$/;
const SAFE_PUBLIC_STORAGE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[a-z0-9_-]+\/[a-zA-Z0-9_./%-]+$/i;

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service connection is missing for Re-Master promotions');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

/** Published low-resolution art previews ONLY; no masters/private originals. */
export async function loadPublishedMixArt(): Promise<PromotionItem[]> {
  const client = supabase();
  const {data,error} = await client.from('art_gallery_works')
    .select('id,title_en,style_id,collection_id,public_preview_path,published')
    .eq('published',true).not('public_preview_path','is',null).limit(1000);
  if (error) throw new Error('Art catalog failed: '+error.message);
  const bucket=client.storage.from('art-previews');
  return (data||[]).filter(row => ART_PATH.test(String(row.public_preview_path||'')) &&
    /^[a-z0-9][a-z0-9-]{0,120}$/.test(String(row.id))).map(row=>({
    id:String(row.id), title:String(row.title_en||row.id),
    style:String(row.style_id||''),collection:String(row.collection_id||''),
    imageUrl:bucket.getPublicUrl(String(row.public_preview_path)).data.publicUrl,
    detailUrl:'https://art.freddybremseth.com/verk/'+encodeURIComponent(String(row.id))+'/',
  }));
}

/** Resolve a cover only to our own public book site or an approved public Supabase asset. */
export function publicBookCoverUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cover=raw.trim();
  if (SAFE_BOOK_PATH.test(cover)) return 'https://books.freddybremseth.com/'+cover.replace(/^\//,'');
  if (!SAFE_PUBLIC_STORAGE.test(cover)) return null;
  try { const url=new URL(cover);return url.hostname===new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ereapsfcsqtdmzosgnnn.supabase.co').hostname ? url.href : null; }
  catch { return null; }
}

export async function loadPublishedMixBooks():Promise<PromotionItem[]> {
  const client=supabase();
  const [{data:books,error},{data:series,error:seriesError}] = await Promise.all([
    client.from('book_titles').select('id,slug,title,cover_image_url,series_id,language,status').eq('status','published').not('cover_image_url','is',null).limit(500),
    client.from('book_series').select('id,slug,title').limit(250),
  ]);
  if (error) throw new Error('Book catalog failed: '+error.message);
  if (seriesError) throw new Error('Book series catalog failed: '+seriesError.message);
  const seriesById=new Map((series||[]).map(row=>[row.id,{slug:String(row.slug||''), title: typeof row.title==='string'?row.title:String(row.title?.en||row.title?.no||'')}] ));
  return (books||[]).flatMap(book=>{
    const cover=publicBookCoverUrl(book.cover_image_url);
    const slug=String(book.slug||'');
    if(!cover|| !/^[a-z0-9][a-z0-9-]{0,120}$/.test(slug)) return [];
    const seriesInfo=seriesById.get(book.series_id);
    return [{
      id:String(book.id),title:String(book.title||slug),imageUrl:cover,
      detailUrl:'https://books.freddybremseth.com/books/'+encodeURIComponent(slug),
      series:seriesInfo?.slug||'',language:String(book.language||''),
    }];
  });
}

export type PromotionSelection = {
  brand: PromotionBrand;
  artStyles?: string[]; artCollections?: string[]; artIds?: string[];
  bookSeries?: string[]; bookLanguages?: string[]; bookIds?: string[];
  randomSeed: string;
};

export function selectApprovedPromotionItems(items:PromotionItem[],selection:PromotionSelection,limit:number):PromotionItem[] {
  if(!['art','books'].includes(selection.brand)) return [];
  const values = (v?:string[])=>new Set((v||[]).filter(Boolean).map(x=>x.toLowerCase()));
  const ids=values(selection.brand==='art'?selection.artIds:selection.bookIds);
  const styles=values(selection.artStyles),collections=values(selection.artCollections);
  const series=values(selection.bookSeries),languages=values(selection.bookLanguages);
  const candidates=items.filter(item=>
    (!ids.size||ids.has(item.id.toLowerCase())) &&
    (selection.brand!=='art'||(!styles.size||styles.has((item.style||'').toLowerCase())) &&
      (!collections.size||collections.has((item.collection||'').toLowerCase()))) &&
    (selection.brand!=='books'||(!series.size||series.has((item.series||'').toLowerCase())) &&
      (!languages.size||languages.has((item.language||'').toLowerCase())))
  );
  if(!candidates.length) return [];
  // Per-job randomness remains reproducible for a given saved production plan.
  let seed=2166136261;
  for (const ch of selection.randomSeed){seed^=ch.charCodeAt(0);seed=Math.imul(seed,16777619);}
  const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  const cap=Math.max(1,Math.min(180,Math.floor(limit)));
  const ordered:PromotionItem[]=[];
  while(ordered.length<cap){
    const batch=[...candidates];
    for(let i=batch.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[batch[i],batch[j]]=[batch[j],batch[i]];}
    if(ordered.length&&batch.length>1&&ordered[ordered.length-1].id===batch[0].id){
      const first=batch.shift()!; batch.push(first);
    }
    ordered.push(...batch.slice(0,cap-ordered.length));
  }
  return ordered;
}
