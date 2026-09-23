import {createClient} from "@supabase/supabase-js";
import {propertyMatchesBrand} from "@/lib/realty/brand-rules";
import {isApprovedStudioReelImage,type StudioReelBrand,type StudioReelSource} from "./remaster-reels-studio";
export type StudioPropertyBrand=Extract<StudioReelBrand,"zeneco"|"pinoso">;
export interface StudioPropertyCard extends StudioReelSource{area:string;}
export interface StudioPropertyCatalog{areas:string[];properties:StudioPropertyCard[];}
function fold(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();}
export function selectStudioProperties(rows:Record<string,unknown>[],brand:StudioPropertyBrand,area?:string):StudioPropertyCatalog{
  const eligible=rows.filter(row=>row.show_on_website!==false&&row.website_visible!==false&&
    propertyMatchesBrand(row,brand==="pinoso"?"pinosoecolife":"zeneco"));
  const areas=[...new Set(eligible.map(row=>String(row.town||"").trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"nb"));
  const selected=area?eligible.filter(row=>fold(String(row.town||""))===fold(area)):[];
  const properties:StudioPropertyCard[]=selected.flatMap(row=>{
    const id=String(row.id||""),imageUrl=String(row.primary_image||"");
    if(!/^[a-f0-9-]{36}$/i.test(id)||!isApprovedStudioReelImage(imageUrl,brand))return [];
    return [{
      id,title:String(row.title||row.location||"Home").slice(0,130),
      imageUrl,detailUrl:"",area:String(row.town||""),
    }];
  }).slice(0,150);
  return {areas,properties};
}
export async function loadStudioProperties(brand:StudioPropertyBrand,area?:string):Promise<StudioPropertyCatalog>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("REEL_PROPERTY_CATALOG_UNAVAILABLE");
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const rows:Record<string,unknown>[]=[];
  for(let from=0;from<3000;from+=500){
    const {data,error}=await db.from("properties").select("*")
      .order("created_at",{ascending:false}).range(from,from+499);
    if(error)throw new Error("REEL_PROPERTY_CATALOG: "+error.message);
    if(!data?.length)break;
    rows.push(...data);
    if(data.length<500)break;
  }
  return selectStudioProperties(rows,brand,area);
}
