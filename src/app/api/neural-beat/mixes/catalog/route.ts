import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { loadPublishedMixArt, loadPublishedMixBooks } from "@/services/pipelines/remaster-mix-promotions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/** Read-only promotion catalog; owner only. Never exposes art originals or book manuscript files. */
export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  try {
    const [art,books] = await Promise.all([loadPublishedMixArt(),loadPublishedMixBooks()]);
    return NextResponse.json({
      art,books,
      sources:{
        zeneco:"RealtyFlow public ZenEcoHomes property images",
        art:"Published public art-previews/view.webp only",
        books:"Published book_titles covers only",
      },
    },{headers:{"Cache-Control":"private, no-store"}});
  } catch(err) {
    return NextResponse.json({error:err instanceof Error?err.message:"Promotion catalog failed"},{status:503});
  }
}
