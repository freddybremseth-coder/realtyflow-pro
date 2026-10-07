import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

import type { PropertyCreativeStyle } from "@/lib/marketing/creative-style";

type FactSource = { claim: string; source: string };

type StorageBucket = {
  upload: (path: string, body: Buffer, options?: Record<string, unknown>) => Promise<{ error?: { message?: string } | null }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
};

export interface PropertyCardSupabase {
  storage: {
    from: (bucket: string) => StorageBucket;
  };
}

export interface PropertySocialCardInput {
  brandId: string;
  brandName: string;
  propertyId: string;
  propertyRef?: string | null;
  sourceImageUrl: string;
  creativeStyle: PropertyCreativeStyle;
  factSources: FactSource[];
  channel: "facebook" | "instagram";
}

export interface PropertySocialCardResult {
  imageUrl: string;
  storagePath: string;
  rendered: boolean;
}

const WIDTH = 1080;
const HEIGHT = 1350;
export const PROPERTY_SOCIAL_CARD_VERSION = "psc-2.0";

function safeFact(input: FactSource[], prefix: string) {
  const row = input.find(({ claim }) => claim.toLowerCase().startsWith(prefix.toLowerCase()));
  return row?.claim.slice(prefix.length).trim() || null;
}

function cleanText(value: string | null | undefined, max = 90) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function compactFacts(facts: FactSource[]) {
  const candidates = [
    safeFact(facts, "Soverom:") && `${safeFact(facts, "Soverom:")} soverom`,
    safeFact(facts, "Bad:") && `${safeFact(facts, "Bad:")} bad`,
    safeFact(facts, "Boligareal:"),
    safeFact(facts, "Tomt:"),
    safeFact(facts, "Privat/felles basseng:"),
    safeFact(facts, "Garasje/parkering oppgitt:"),
  ].filter(Boolean) as string[];
  return candidates.slice(0, 4).map((v) => cleanText(v, 36));
}

function styleCopy(input: PropertySocialCardInput) {
  const facts = input.factSources;
  const title = cleanText(safeFact(facts, "Tittel:") || input.propertyRef || "Bolig", 62);
  const place = cleanText(safeFact(facts, "Sted:") || safeFact(facts, "Region:"), 44);
  const price = cleanText(safeFact(facts, "Pris:"), 40);
  const propertyType = cleanText(safeFact(facts, "Boligtype:"), 34);
  const items = compactFacts(facts);

  switch (input.creativeStyle) {
    case "fact_card":
      return { kicker: place || input.brandName, headline: title, hero: price, subline: items.join("  •  ") };
    case "question_hook":
      return { kicker: input.brandName, headline: price ? `Hva får du for ${price}?` : `Kunne dette vært ditt neste hjem?`, hero: place, subline: items.join("  •  ") };
    case "minimal_premium":
      return { kicker: input.brandName, headline: title, hero: place, subline: price };
    case "lifestyle":
      return { kicker: place || input.brandName, headline: propertyType || title, hero: price, subline: items.slice(0, 2).join("  •  ") };
    case "advisor":
      return { kicker: `${input.brandName} · personlig rådgivning`, headline: title, hero: price, subline: place };
    case "carousel":
      return { kicker: `${input.brandName} · se mer`, headline: title, hero: price, subline: [place, ...items.slice(0, 2)].filter(Boolean).join("  •  ") };
    case "hero_property":
    default:
      return { kicker: input.brandName, headline: title, hero: price || place, subline: [place, ...items.slice(0, 3)].filter(Boolean).join("  •  ") };
  }
}

function run(binary: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += String(chunk); });
    proc.on("error", reject);
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.split("\n").slice(-8).join("\n"))));
  });
}

async function download(url: string, destination: string) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; RealtyFlow/1.0; +https://flow.chatgenius.pro)",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`PROPERTY_CARD_IMAGE_DOWNLOAD_FAILED: ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`PROPERTY_CARD_IMAGE_CONTENT_TYPE_INVALID: ${contentType.slice(0, 80)}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("PROPERTY_CARD_IMAGE_EMPTY");
  await fs.writeFile(destination, buffer);
}

function fontFile() {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  ];
  return candidates;
}

async function existingFont() {
  for (const candidate of fontFile()) {
    try { await fs.access(candidate); return candidate; } catch {}
  }
  return null;
}

async function writeTextFile(dir: string, name: string, value: string) {
  const file = path.join(dir, `${name}.txt`);
  await fs.writeFile(file, value || "", "utf8");
  return file.replace(/:/g, "\\:");
}

function drawText(file: string, font: string | null, size: number, x: string, y: string, color = "white", extra = "") {
  const fontArg = font ? `:fontfile='${font.replace(/'/g, "\\'")}'` : "";
  return `drawtext=textfile='${file}'${fontArg}:fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}:shadowcolor=black@0.75:shadowx=2:shadowy=2:line_spacing=8${extra}`;
}

function wrapText(value: string, maxChars: number, maxLines = 2) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current || (current + " " + word).length <= maxChars) {
      current = current ? current + " " + word : word;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  const consumed = lines.join(" ").length;
  if (consumed < value.length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[.,;:!?-]*$/, "") + "…";
  }
  return lines.join("\n");
}

function fontSizeFor(value: string, large: number, medium: number, small: number) {
  const length = value.replace(/\n/g, "").length;
  return length > 48 ? small : length > 30 ? medium : large;
}

function layoutFilters(
  input: PropertySocialCardInput,
  copy: ReturnType<typeof styleCopy>,
  files: { kicker: string; headline: string; hero: string; subline: string },
  font: string | null,
) {
  const cta = input.channel === "facebook" ? "Se boligen på nettsiden" : "Se boligen · kontakt oss";
  const fontArg = font ? `fontfile='${font.replace(/'/g, "\\'")}':` : "";
  const headlineSize = fontSizeFor(copy.headline, 60, 50, 42);
  const commonCta = (x: string, y: string, color = "white@0.88") =>
    `drawtext=text='${cta}':${fontArg}fontsize=26:fontcolor=${color}:x=${x}:y=${y}`;

  switch (input.creativeStyle) {
    case "minimal_premium":
      return [
        `drawbox=x=0:y=0:w=iw:h=78:color=black@0.28:t=fill`,
        `drawbox=x=0:y=ih-270:w=iw:h=270:color=black@0.44:t=fill`,
        `drawbox=x=54:y=ih-245:w=150:h=3:color=white@0.82:t=fill`,
        drawText(files.kicker, font, 25, "54", "26", "white@0.92"),
        drawText(files.headline, font, fontSizeFor(copy.headline, 48, 42, 36), "54", "h-286"),
        copy.hero ? drawText(files.hero, font, 30, "54", "h-145", "white@0.92") : "",
        copy.subline ? drawText(files.subline, font, 30, "w-text_w-54", "h-145", "white@0.92") : "",
        commonCta("54", "h-58", "white@0.78"),
      ];
    case "fact_card":
      return [
        `drawbox=x=0:y=0:w=iw:h=76:color=black@0.42:t=fill`,
        `drawbox=x=0:y=ih-500:w=iw:h=500:color=black@0.82:t=fill`,
        `drawbox=x=54:y=ih-462:w=6:h=285:color=white@0.88:t=fill`,
        drawText(files.kicker, font, 25, "54", "25", "white@0.90"),
        drawText(files.headline, font, fontSizeFor(copy.headline, 52, 46, 38), "86", "h-438"),
        copy.hero ? drawText(files.hero, font, 64, "86", "h-290") : "",
        copy.subline ? drawText(files.subline, font, 29, "86", "h-180", "white@0.90") : "",
        commonCta("86", "h-66"),
      ];
    case "question_hook":
      return [
        `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.20:t=fill`,
        `drawbox=x=54:y=390:w=972:h=440:color=black@0.58:t=fill`,
        `drawbox=x=150:y=430:w=780:h=3:color=white@0.72:t=fill`,
        drawText(files.kicker, font, 24, "(w-text_w)/2", "462", "white@0.82"),
        drawText(files.headline, font, fontSizeFor(copy.headline, 58, 50, 42), "(w-text_w)/2", "540"),
        copy.hero ? drawText(files.hero, font, 34, "(w-text_w)/2", "690", "white@0.94") : "",
        copy.subline ? drawText(files.subline, font, 26, "(w-text_w)/2", "770", "white@0.86") : "",
        commonCta("(w-text_w)/2", "h-74"),
      ];
    case "lifestyle":
      return [
        `drawbox=x=0:y=0:w=iw:h=72:color=black@0.30:t=fill`,
        `drawbox=x=0:y=ih-335:w=iw:h=335:color=black@0.48:t=fill`,
        drawText(files.kicker, font, 25, "54", "24", "white@0.92"),
        drawText(files.headline, font, fontSizeFor(copy.headline, 55, 48, 40), "54", "h-300"),
        copy.hero ? drawText(files.hero, font, 46, "54", "h-160") : "",
        copy.subline ? drawText(files.subline, font, 26, "54", "h-108", "white@0.88") : "",
        commonCta("w-text_w-54", "h-58", "white@0.80"),
      ];
    case "advisor":
      return [
        `drawbox=x=0:y=0:w=460:h=ih:color=black@0.68:t=fill`,
        `drawbox=x=54:y=94:w=120:h=4:color=white@0.88:t=fill`,
        drawText(files.kicker, font, 23, "54", "122", "white@0.86"),
        drawText(files.headline, font, fontSizeFor(copy.headline, 44, 37, 31), "54", "260"),
        copy.hero ? drawText(files.hero, font, 43, "54", "h-365") : "",
        copy.subline ? drawText(files.subline, font, 28, "54", "h-285", "white@0.90") : "",
        commonCta("54", "h-92"),
      ];
    case "carousel":
      return [
        `drawbox=x=42:y=42:w=996:h=92:color=black@0.46:t=fill`,
        `drawbox=x=42:y=ih-390:w=996:h=348:color=black@0.66:t=fill`,
        `drawbox=x=70:y=ih-352:w=190:h=3:color=white@0.80:t=fill`,
        drawText(files.kicker, font, 25, "70", "72", "white@0.92"),
        drawText(files.headline, font, fontSizeFor(copy.headline, 54, 47, 39), "70", "h-320"),
        copy.hero ? drawText(files.hero, font, 48, "70", "h-170") : "",
        copy.subline ? drawText(files.subline, font, 25, "70", "h-115", "white@0.88") : "",
        commonCta("w-text_w-70", "h-62"),
      ];
    case "hero_property":
    default:
      return [
        `drawbox=x=0:y=0:w=iw:h=82:color=black@0.40:t=fill`,
        `drawbox=x=0:y=ih-430:w=iw:h=430:color=black@0.72:t=fill`,
        `drawbox=x=54:y=ih-390:w=6:h=245:color=white@0.90:t=fill`,
        drawText(files.kicker, font, 26, "54", "27", "white@0.92"),
        drawText(files.headline, font, headlineSize, "86", "h-365"),
        copy.hero ? drawText(files.hero, font, 62, "86", "h-205") : "",
        copy.subline ? drawText(files.subline, font, 27, "86", "h-130", "white@0.90") : "",
        commonCta("86", "h-66"),
      ];
  }
}

export async function renderPropertySocialCard(
  supabase: PropertyCardSupabase,
  input: PropertySocialCardInput,
): Promise<PropertySocialCardResult> {
  if (!ffmpegPath) throw new Error("PROPERTY_CARD_FFMPEG_MISSING");
  try {
    await fs.access(ffmpegPath);
  } catch {
    throw new Error("PROPERTY_CARD_FFMPEG_MISSING");
  }
  if (!/^https:\/\//i.test(input.sourceImageUrl)) throw new Error("PROPERTY_CARD_SOURCE_IMAGE_INVALID");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rf-property-card-"));
  const sourcePath = path.join(dir, "source");
  const outputPath = path.join(dir, "card.jpg");

  try {
    await download(input.sourceImageUrl, sourcePath);
    const font = await existingFont();
    const copy = styleCopy(input);
    const headlineValue = input.creativeStyle === "advisor"
      ? wrapText(copy.headline, 20, 3)
      : ["question_hook", "hero_property", "fact_card"].includes(input.creativeStyle)
        ? wrapText(copy.headline, 30, 2)
        : wrapText(copy.headline, 34, 2);
    const kicker = await writeTextFile(dir, "kicker", copy.kicker);
    const headline = await writeTextFile(dir, "headline", headlineValue);
    const hero = await writeTextFile(dir, "hero", copy.hero);
    const subline = await writeTextFile(dir, "subline", copy.subline);

    const filters = [
      `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WIDTH}:${HEIGHT}`,
      ...layoutFilters(input, copy, { kicker, headline, hero, subline }, font),
    ].filter(Boolean).join(",");

    await run(ffmpegPath, ["-y", "-i", sourcePath, "-vf", filters, "-frames:v", "1", "-q:v", "2", outputPath]);
    const buffer = await fs.readFile(outputPath);

    const digest = crypto.createHash("sha256")
      .update(`${PROPERTY_SOCIAL_CARD_VERSION}|${input.brandId}|${input.propertyId}|${input.creativeStyle}|${input.channel}|${input.sourceImageUrl}`)
      .digest("hex")
      .slice(0, 24);
    const storagePath = `property-social/${input.brandId}/${input.propertyId}/${input.channel}-${input.creativeStyle}-${digest}.jpg`;
    const bucket = supabase.storage.from("content-images");
    const { error } = await bucket.upload(storagePath, buffer, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) throw new Error(`PROPERTY_CARD_UPLOAD_FAILED: ${error.message || "unknown"}`);

    const imageUrl = bucket.getPublicUrl(storagePath).data.publicUrl;
    return { imageUrl, storagePath, rendered: true };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
