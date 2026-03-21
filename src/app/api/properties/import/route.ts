import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/xml, text/xml, application/json, */*",
        "User-Agent": "RealtyFlow-Pro/1.0",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const text = await response.text();
    return NextResponse.json({ text, url });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Feil ved henting av URL" },
      { status: 500 }
    );
  }
}
