import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function sanitizeFilename(value: string | null) {
  const fallback = "bilde.png";
  if (!value) return fallback;
  const cleaned = value
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}

function isPrivateIpv4(hostname: string) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [, aRaw, bRaw] = match;
  const a = Number(aRaw);
  const b = Number(bRaw);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 169;
}

function validateRemoteUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Ugyldig bilde-URL.");
  }
  if (BLOCKED_HOSTS.has(url.hostname) || isPrivateIpv4(url.hostname)) {
    throw new Error("Bilde-URL kan ikke peke til lokal eller privat adresse.");
  }
  return url;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url");
  const filename = sanitizeFilename(searchParams.get("filename"));

  if (!imageUrl) {
    return new NextResponse("Mangler bilde-URL.", { status: 400 });
  }

  try {
    const url = validateRemoteUrl(imageUrl);
    const upstream = await fetch(url, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      return new NextResponse(`Kunne ikke hente bildet (${upstream.status}).`, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return new NextResponse("URL-en peker ikke til et bilde.", { status: 415 });
    }

    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Kunne ikke laste ned bildet.", { status: 500 });
  }
}
