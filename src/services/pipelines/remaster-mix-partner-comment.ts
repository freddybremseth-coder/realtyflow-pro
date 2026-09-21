/** Owner-facing comment for the precise published visuals used in a Re-Master mix.
 *  Never imply an unrelated painting/book/property appears, invent a property
 *  listing URL, or post multiple links to the same work. This runs only
 *  after a verified YouTube video has been persisted as completed.
 */
import type { PromotionBrand, PromotionItem } from "./remaster-mix-promotions";
import type { RemasterMixRegion, RemasterMixVisualType } from "./remaster-mix-planner";

export type PartnerCommentStyle = "short" | "detailed";
export type PartnerCommentInput = {
  brand: PromotionBrand;
  style?: PartnerCommentStyle;
  title?: string;
  promotedItems?: PromotionItem[];
  artStyles?: string[];
  artCollections?: string[];
  bookSeries?: string[];
  bookLanguages?: string[];
  region?: RemasterMixRegion;
  visualTypes?: RemasterMixVisualType[];
};
const MUSIC = "https://remaster.freddybremseth.com/";
const ART = "https://art.freddybremseth.com/";
const BOOKS = "https://books.freddybremseth.com/";
const HOMES = "https://zenecohomes.com/";
const regionNames: Record<RemasterMixRegion, string> = {
  any:"the Costa Blanca and surrounding areas",north:"Costa Blanca North",
  south:"Costa Blanca South",inland:"inland Alicante","costa-calida":"Costa Calida",
};
const types: Record<RemasterMixVisualType,string> = {
  mixed:"homes",villas:"villas",apartments:"apartments",pools:"homes with pools",
  "sea-views":"homes with sea views",interiors:"home interiors",
};
function clean(value:string,max=100) {
  return String(value||"").replace(/[<>\r\n\t]/g," ").replace(/\s+/g," ").trim().slice(0,max);
}
function readable(items:string[]|undefined,max=3){
  const values=[...new Set((items||[]).map(x=>clean(x.replace(/-/g," "),44)).filter(Boolean))];
  return values.slice(0,max).join(", ");
}
function safeVisuals(items:PromotionItem[]|undefined,brand:"art"|"books",max:number){
  const host=brand==="art"?"art.freddybremseth.com":"books.freddybremseth.com";
  const seen=new Set<string>();
  const valid:PromotionItem[] = [];
  for(const item of items||[]){
    try{
      const url=new URL(item.detailUrl);
      if(url.protocol!=="https:"||url.hostname!==host||url.username||url.password||
        !url.pathname.startsWith(brand==="art"?"/verk/":"/book/")||seen.has(url.href))continue;
      seen.add(url.href);
      valid.push({...item,title:clean(item.title,90),detailUrl:url.href});
      if(valid.length>=max)break;
    }catch{/* Reject unverified / off-site catalog links. */}
  }
  return valid;
}
export function buildRemasterPartnerComment(input:PartnerCommentInput):string {
  const brand=input.brand;
  const detailed=input.style!=="short";
  const footer="🎧 Music by Re-Master Freddy: "+MUSIC;
  if(brand==="none") {
    return ["🎧 Music by Re-Master Freddy.","Listen to more music: "+MUSIC].join("\n");
  }
  if(brand==="zeneco"){
    const region= input.region && input.region!=="any" ? " in "+regionNames[input.region] : "";
    const chosen=(input.visualTypes||[]).filter(x=>x!=="mixed");
    const type=chosen.length===1?" ("+types[chosen[0]]+")":"";
    return [
      "🏡 The visuals in this music mix feature homes and property inspiration from Zen Eco Homes"+region+type+".",
      "Browse the current property listings: "+HOMES,
      ...(detailed ? [
        "Photos are property and lifestyle inspiration; availability and prices can change. Open the website for current listings and property details.",
        "Interested in a particular home? Contact Zen Eco Homes through the website with the video title and a screenshot of the property."
      ]:[]),
      footer,
    ].join("\n\n");
  }
  if(brand==="art"){
    const works=safeVisuals(input.promotedItems,"art",detailed?6:2);
    const style=readable(input.artStyles);
    const collection=readable(input.artCollections);
    const details=detailed?[style?"Selected art styles: "+style+".":"",collection?"Selected collections: "+collection+".":""].filter(Boolean):[];
    return [
      "🎨 This music mix features artwork by Freddy Bremseth.",
      "Explore the gallery: "+ART,
      ...details,
      ...(works.length?["Featured artworks shown in this video:",...works.map(x=>x.title+" — "+x.detailUrl)]:[]),
      footer,
    ].join("\n\n");
  }
  if(brand==="books"){
    const books=safeVisuals(input.promotedItems,"books",detailed?6:2);
    const series=readable(input.bookSeries);
    const languages=readable(input.bookLanguages);
    const details=detailed?[series?"Selected book series: "+series+".":"",languages?"Selected editions: "+languages+".":""].filter(Boolean):[];
    return [
      "📚 The visuals in this music mix feature published books and book covers by Freddy Bremseth.",
      "Discover the books: "+BOOKS,
      ...details,
      ...(books.length?["Books featured in this video:",...books.map(x=>x.title+" — "+x.detailUrl)]:[]),
      footer,
    ].join("\n\n");
  }
  return footer;
}
