import { NextRequest, NextResponse } from "next/server";

import { remasterOAuthRedirectUrl } from "@/lib/remaster/oauth-return";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: NextRequest) {
  return NextResponse.redirect(remasterOAuthRedirectUrl(request.nextUrl));
}
