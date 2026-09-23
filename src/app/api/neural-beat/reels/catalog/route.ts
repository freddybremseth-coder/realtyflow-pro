import {NextRequest,NextResponse} from "next/server";
import {requireAdminApi} from "@/lib/api-admin";
import {loadPublishedMixArt,loadPublishedMixBooks} from "@/services/pipelines/remaster-mix-promotions";
import {loadStudioProperties} from "@/services/pipelines/remaster-reels-property-catalog";
export const dynamic="force-dynamic";
export const revalidate=0;
export const maxDuration=60;
/** Read-only published previews and website-visible property cards. Never originals. */
export async function GET(request:NextRequest){
  const denied=await requireAdminApi(request);
  if(denied)return denied;
  const url=new URL(request.url);
  const brand=url.searchParams.get("brand");
  const area=(url.searchParams.get("area")||"").trim();
  if(!["art","books","zeneco","pinoso"].includes(brand||"")||area.length>100)
    return NextResponse.json({error:"Invalid Reel brand or area."},{status:400});
  try{
    if(brand==="art")return NextResponse.json({brand,items:await loadPublishedMixArt(),areas:[]},{headers:{"Cache-Control":"private, no-store"}});
    if(brand==="books")return NextResponse.json({brand,items:await loadPublishedMixBooks(),areas:[]},{headers:{"Cache-Control":"private, no-store"}});
    const result=await loadStudioProperties(brand as "zeneco"|"pinoso",area);
    return NextResponse.json({brand,items:result.properties,areas:result.areas},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Cannot load Reel catalog."},{status:503});
  }
}
