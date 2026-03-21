import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/xml, text/xml, */*",
        "User-Agent": "RealtyFlow-Pro/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Stream the XML directly back to avoid memory issues with large feeds
    const text = await response.text();

    return new NextResponse(text, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Feil ved henting av URL" },
      { status: 500 }
    );
  }
}
