import { describe,expect,it } from 'vitest';
import { fetchApprovedReelSource, reelCaption, REEL_SECONDS, selectReelAssets } from './art-lounge-reels';
import type { PromotionItem } from './remaster-mix-promotions';

const songs=Array.from({length:5},(_,i)=>({
  id:'song-'+i,name:'Original music '+i,
  file_url:'https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/song-'+i+'.mp3',
  youtube_url:'https://www.youtube.com/watch?v='+i,
}));
const works:PromotionItem[]=Array.from({length:8},(_,i)=>({
  id:'work-'+i,title:'Original art '+i,style:['abstract','surrealism','impressionism','landscape'][i%4],
  imageUrl:'https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-previews/work-'+i+'/view.webp',
  detailUrl:'https://art.freddybremseth.com/verk/work-'+i+'/',
}));
describe('Art Lounge daily production contract',()=>{
  it('selects the same 3 distinct published artworks and a song for the same day',()=>{
    const first=selectReelAssets('2026-09-22',songs,works);
    expect(selectReelAssets('2026-09-22',songs,works)).toEqual(first);
    expect(new Set(first.artwork.map(x=>x.id)).size).toBe(3);
    expect(new Set(first.artwork.map(x=>x.style)).size).toBe(3);
    expect(REEL_SECONDS).toBeGreaterThanOrEqual(15);
    expect(REEL_SECONDS).toBeLessThanOrEqual(35);
  });
  it('rotates away from a song used during recent days',()=>{
    const prior=selectReelAssets('2026-09-22',songs,works);
    const next=selectReelAssets('2026-09-22',songs,works,[prior.song.id]);
    expect(next.song.id).not.toBe(prior.song.id);
  });
  it('credits the actual chosen artwork and the original music',()=>{
    const selected=selectReelAssets('2026-09-22',songs,works);
    const caption=reelCaption(selected);
    for(const item of selected.artwork)expect(caption).toContain(item.detailUrl);
    expect(caption).toContain(selected.song.name);
    expect(caption).toContain(selected.song.youtube_url);
  });
  it('rejects unapproved sources before fetch (including private art originals)',async()=>{
    await expect(fetchApprovedReelSource('https://evil.example.com/work.webp','art')).rejects.toThrow('ART_LOUNGE_UNTRUSTED_SOURCE');
    await expect(fetchApprovedReelSource('https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/private/art-originals/work.webp','art')).rejects.toThrow('ART_LOUNGE_UNTRUSTED_SOURCE');
    await expect(fetchApprovedReelSource('https://evil.example.com/audio.mp3','audio')).rejects.toThrow('ART_LOUNGE_UNTRUSTED_SOURCE');
  });
});
