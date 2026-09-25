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
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PROPERTY_CARD_IMAGE_DOWNLOAD_FAILED: ${response.status}`);
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
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

function drawText(file: string, font: string | null, size: number, x: string, y: string, color = "white") {
  const fontArg = font ? `:fontfile='${font.replace(/'/g, "\\'")}'` : "";
  return `drawtext=textfile='${file}'${fontArg}:fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}:shadowcolor=black@0.75:shadowx=2:shadowy=2`;
}

export async function renderPropertySocialCard(
  supabase: PropertyCardSupabase,
  input: PropertySocialCardInput,
): Promise<PropertySocialCardResult> {
  if (!ffmpegPath) throw new Error("PROPERTY_CARD_FFMPEG_MISSING");
  if (!/^https:\/\//i.test(input.sourceImageUrl)) throw new Error("PROPERTY_CARD_SOURCE_IMAGE_INVALID");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rf-property-card-"));
  const sourcePath = path.join(dir, "source");
  const outputPath = path.join(dir, "card.jpg");

  try {
    await download(input.sourceImageUrl, sourcePath);
    const font = await existingFont();
    const copy = styleCopy(input);
    const kicker = await writeTextFile(dir, "kicker", copy.kicker);
    const headline = await writeTextFile(dir, "headline", copy.headline);
    const hero = await writeTextFile(dir, "hero", copy.hero);
    const subline = await writeTextFile(dir, "subline", copy.subline);

    const minimal = input.creativeStyle === "minimal_premium";
    const factCard = input.creativeStyle === "fact_card";
    const overlayHeight = minimal ? 330 : factCard ? 470 : 420;
    const filters = [
      `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WIDTH}:${HEIGHT}`,
      `drawbox=x=0:y=0:w=iw:h=88:color=black@0.54:t=fill`,
      `drawbox=x=0:y=ih-${overlayHeight}:w=iw:h=${overlayHeight}:color=black@0.68:t=fill`,
      drawText(kicker, font, 30, "54", "28", "white@0.92"),
      drawText(headline, font, minimal ? 48 : 58, "54", `h-${overlayHeight - 54}`),
      copy.hero ? drawText(hero, font, minimal ? 38 : 68, "54", `h-${overlayHeight - 150}`) : "",
      copy.subline ? drawText(subline, font, factCard ? 31 : 30, "54", `h-${overlayHeight - 250}`, "white@0.92") : "",
      `drawtext=text='${input.channel === "facebook" ? "Se boligen på nettsiden" : "Se boligen · kontakt oss"}':${font ? `fontfile='${font.replace(/'/g, "\\'")}':` : ""}fontsize=28:fontcolor=white@0.86:x=54:y=h-58`,
    ].filter(Boolean).join(",");

    await run(ffmpegPath, ["-y", "-i", sourcePath, "-vf", filters, "-frames:v", "1", "-q:v", "2", outputPath]);
    const buffer = await fs.readFile(outputPath);

    const digest = crypto.createHash("sha256")
      .update(`${input.brandId}|${input.propertyId}|${input.creativeStyle}|${input.channel}|${input.sourceImageUrl}`)
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
