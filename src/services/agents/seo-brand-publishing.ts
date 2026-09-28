import type { GSCBrandSnapshot } from "./seo-search-console";

/** Explicit public homepage scope. Never derive repository paths or copy from Google/user input. */
export const SEO_BRAND_PUBLISHERS = [
  { brandId: "pinosoecolife", repository: "freddybremseth-coder/Pinosoecolife", file: "src/app/page.tsx", layout: "src/app/layout.tsx", adapter: "next-home",
    origin: "https://www.pinosoecolife.com", language: "no",
    title: "Pinoso Eco Life | Bolig og tomt i Alicante og Murcia",
    description: "Utforsk boliger, tomter og nybygg i Pinoso og innlandet i Alicante og Murcia. Sammenlign områder og få norsk rådgivning før du velger ditt neste hjem." },
  { brandId: "freddyb", repository: "freddybremseth-coder/freddybremseth", file: "home.html", adapter: "html",
    origin: "https://www.freddybremseth.com", language: "no",
    title: "Freddy Bremseth | Eiendom i Spania, AI, bøker og kunst",
    description: "Bli kjent med Freddy Bremseths arbeid med eiendom i Spania, AI, bøker, kunst og musikk. Utforsk prosjektene og finn riktig kontaktvei for din henvendelse." },
  { brandId: "freddypublishing", repository: "freddybremseth-coder/freddybremseth", file: "books/index.html", adapter: "html",
    origin: "https://books.freddybremseth.com", language: "no",
    title: "Freddy Bremseth | Bøker, krim, thrillere og sakprosa",
    description: "Utforsk Freddy Bremseths bøker og serier: psykologiske thrillere, krim og sakprosa om livet og samfunnet. Les prøvekapitler og finn din neste bok." },
  { brandId: "freddyart", repository: "freddybremseth-coder/freddybremseth", file: "art/index.html", adapter: "html",
    origin: "https://art.freddybremseth.com", language: "en",
    title: "Freddy Bremseth Art | Digital Art and Curated Collections",
    description: "Explore digital art by Freddy Bremseth, from symbolic portraits to Mediterranean scenes and imagined worlds. Browse curated collections and artwork previews." },
  { brandId: "remasterfreddy", repository: "freddybremseth-coder/remasterfreddy", file: "index.html", adapter: "html",
    origin: "https://remaster.freddybremseth.com", language: "en",
    title: "Re-Master Freddy | Electronic Music, House and Chill Beats",
    description: "Discover Re-Master Freddy's electronic music, house and chill beats. Explore original tracks, music videos and releases for summer days and relaxed evenings." },
  { brandId: "donaanna", repository: "freddybremseth-coder/donaanna", file: "index.html", adapter: "html",
    origin: "https://www.donaanna.com", language: "no",
    title: "Doña Anna | Olivenolje og bordoliven fra Biar i Alicante",
    description: "Oppdag Doña Annas olivenolje og bordoliven fra Biar i Alicante. Les om olivensorter, smak, høsting og sporbarhet, og utforsk artikler og oppskrifter." },
  { brandId: "chatgenius", repository: "freddybremseth-coder/chatgenius", file: "index.html", adapter: "html",
    origin: "https://www.chatgenius.pro", language: "no",
    title: "ChatGenius.pro | AI-apper, nettsider og opplæring for bedrifter",
    description: "Utforsk AI-apper, profesjonelle nettsider og praktisk AI-opplæring fra ChatGenius.pro. Se løsningene og ta kontakt om hvordan AI kan hjelpe din bedrift." },
] as const;
export type BrandPublisher = typeof SEO_BRAND_PUBLISHERS[number];
export type BrandMetadata = { title: string; description: string };

export const SEO_BRAND_SECOND_VARIANTS: Record<BrandPublisher["brandId"], BrandMetadata> = {
  pinosoecolife: {
    title: "Pinoso EcoLife | Tomter, nybygg og landlig liv i Spania",
    description: "Utforsk tomter, nybygg og boliger i Pinoso og innlandet i Alicante og Murcia. Sammenlign områder, boligmuligheter og praktiske valg før du kjøper i Spania.",
  },
  freddyb: {
    title: "Freddy Bremseth | Eiendom i Spania, teknologi, bøker og kunst",
    description: "Utforsk Freddy Bremseths arbeid med eiendom i Spania, AI og teknologi, bøker, kunst og musikk. Finn prosjekter, artikler og riktig kontaktvei.",
  },
  freddypublishing: {
    title: "Freddy Bremseth Books | Thrillere, krim og sakprosa",
    description: "Oppdag bøker og serier av Freddy Bremseth, fra psykologiske thrillere og krim til sakprosa. Utforsk titler, omslag og tilgjengelige leseprøver.",
  },
  freddyart: {
    title: "Freddy Bremseth Art | Contemporary Digital Art Collections",
    description: "Discover contemporary digital art by Freddy Bremseth, including symbolic portraits, Mediterranean-inspired works and imagined worlds. Explore artworks and curated collections.",
  },
  remasterfreddy: {
    title: "Re-Master Freddy | Original Electronic Music and Chill Tracks",
    description: "Explore original electronic music by Re-Master Freddy, from house and energetic tracks to calm chill and meditation-inspired releases. Discover music and videos.",
  },
  donaanna: {
    title: "Doña Anna | Oliven fra Biar, Alicante",
    description: "Utforsk Doña Anna og oliven fra Biar i Alicante. Les om olivensorter, innhøsting, smak, gårdsliv, olivenolje og bordoliven fra området.",
  },
  chatgenius: {
    title: "ChatGenius.pro | Praktiske AI-løsninger for bedrifter",
    description: "Utforsk praktiske AI-løsninger, apper, nettsider og opplæring fra ChatGenius.pro. Se hvordan bedrifter kan bruke AI i arbeid, markedsføring og kundedialog.",
  },
};

export function secondVariantForBrand(brandId: BrandPublisher["brandId"]): BrandMetadata {
  return SEO_BRAND_SECOND_VARIANTS[brandId];
}
export type BrandEvidence = { query: string; start: string; end: string; impressions: number; clicks: number; position: number };
export function publisherForBrand(brandId: string) { return SEO_BRAND_PUBLISHERS.find(site => site.brandId === brandId); }

export function brandPublishingEvidence(site: BrandPublisher, snapshot: GSCBrandSnapshot | null, now = new Date()): BrandEvidence | null {
  if (!snapshot || snapshot.brandId !== site.brandId || !snapshot.connected || snapshot.dataQuality.truncated || snapshot.dataQuality.queryRowsSampled !== true) return null;
  const collected = Date.parse(snapshot.collectedAt);
  const start = Date.parse(snapshot.period.currentStart + "T00:00:00Z");
  const end = Date.parse(snapshot.period.currentEnd + "T23:59:59Z");
  if (!Number.isFinite(collected) || !Number.isFinite(end) || !Number.isFinite(start) || start >= end || collected > +now + 60000 || +now-collected > 7*86400000 ||
      end > +now || +now-end > 10*86400000) return null;
  const host = new URL(site.origin).hostname;
  const property = snapshot.property;
  // Shared Freddy Domain grants are measured by exact host by the GSC reader.
  if (property !== site.origin + "/" && property !== "sc-domain:" + host.replace(/^www\./, "") &&
      !(host.endsWith(".freddybremseth.com") && property === "sc-domain:freddybremseth.com")) return null;
  const page = snapshot.topPages.find(row => row.path === "/" && Number.isFinite(row.impressions) && row.impressions >= 100);
  const query = snapshot.topQueryPages.find(row => row.page === "/" && Number.isFinite(row.impressions) && row.impressions >= 40 && row.ctr >= 0 && row.ctr < .03 &&
    row.position >= 4 && row.position <= 20 && row.clicks >= 0 && row.clicks <= row.impressions && row.query.trim().length > 0 && row.query.length <= 180);
  if (!page || !query) return null;
  return { query: query.query, start: snapshot.period.currentStart, end: snapshot.period.currentEnd,
    impressions: query.impressions, clicks: query.clicks, position: query.position };
}

function decode(value: string) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#39|#x27|#\d+|#x[\da-f]+);/gi, entity => {
    const fixed: Record<string,string> = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    if (fixed[entity.toLowerCase()]) return fixed[entity.toLowerCase()];
    const code = entity[2].toLowerCase() === "x" ? parseInt(entity.slice(3,-1),16) : Number(entity.slice(2,-1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}
function escape(value: string) { return value.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/'/g,"&#39;"); }
function attrs(tag: string) {
  const result: Record<string,string> = {};
  for (const match of tag.matchAll(/\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) result[match[1].toLowerCase()] = decode(match[2] ?? match[3]);
  return result;
}
function htmlParts(html: string) {
  const head = /<head(?:\s[^>]*)?>[\s\S]*?<\/head\s*>/i.exec(html);
  if (!head) return null;
  const masked = head[0].replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, text => " ".repeat(text.length));
  const titles = [...masked.matchAll(/<title(?:\s[^>]*)?>([^<]*)<\/title>/gi)];
  const descriptions = [...masked.matchAll(/<meta\b[^>]*>/gi)].filter(match => attrs(match[0]).name?.toLowerCase() === "description");
  const canonicals = [...masked.matchAll(/<link\b[^>]*>/gi)].filter(match => attrs(match[0]).rel?.toLowerCase() === "canonical");
  if (titles.length !== 1 || descriptions.length !== 1 || canonicals.length !== 1) return null;
  const noindex = [...masked.matchAll(/<meta\b[^>]*>/gi)].some(match => {
    const a=attrs(match[0]); return ["robots","googlebot"].includes(a.name?.toLowerCase()) && /\bnoindex\b/i.test(a.content || "");
  });
  return { head, title: titles[0], description: descriptions[0], canonical: attrs(canonicals[0][0]).href, noindex };
}
export function readBrandHtml(html: string): (BrandMetadata & { canonical: string; noindex: boolean }) | null {
  const p = htmlParts(html);
  return p ? { title: decode(p.title[1]), description: attrs(p.description[0]).content || "", canonical: p.canonical, noindex: p.noindex } : null;
}
export function patchBrandHtml(html: string, before: BrandMetadata, after: BrandMetadata): string {
  const parts = htmlParts(html), current = readBrandHtml(html);
  if (!parts || !current || current.title !== before.title || current.description !== before.description) throw new Error("Source metadata changed or is ambiguous");
  const replacements = [
    { index: parts.head.index + parts.title.index!, length: parts.title[0].length, value: `<title>${escape(after.title)}</title>` },
    { index: parts.head.index + parts.description.index!, length: parts.description[0].length, value: `<meta name="description" content="${escape(after.description)}">` },
  ].sort((a,b)=>b.index-a.index);
  let result = html;
  for (const item of replacements) result = result.slice(0,item.index)+item.value+result.slice(item.index+item.length);
  return result;
}
const START = "// SAM SEO HOMEPAGE METADATA START";
const END = "// SAM SEO HOMEPAGE METADATA END";
export function patchNextHomepage(source: string, after: BrandMetadata | null, expected?: BrandMetadata): string {
  const block = source.match(/\/\/ SAM SEO HOMEPAGE METADATA START\nexport const metadata = (\{[^\n]+\});\n\/\/ SAM SEO HOMEPAGE METADATA END\n/);
  if (block) {
    const stored = JSON.parse(block[1]);
    if (!expected || stored.title?.absolute !== expected.title || stored.description !== expected.description) throw new Error("Homepage metadata revision changed");
    source = source.replace(block[0], "");
  } else if (expected) throw new Error("Homepage metadata marker missing");
  if (/\b(?:metadata|generateMetadata)\b/.test(source) || source.includes(START) || source.includes(END)) throw new Error("Existing homepage metadata requires a dedicated adapter");
  if (!after) return source;
  return `${START}\nexport const metadata = ${JSON.stringify({title:{absolute:after.title},description:after.description})};\n${END}\n${source}`;
}
export function readNextLayoutMetadata(source: string): BrandMetadata | null {
  const metadata = source.match(/export const metadata:\s*Metadata\s*=\s*\{([\s\S]*?)\n\};/);
  if (!metadata) return null;
  const title = metadata[1].match(/title:\s*\{\s*default:\s*("(?:[^"\\]|\\.)*")/);
  const description = metadata[1].match(/\n\s*description:\s*("(?:[^"\\]|\\.)*")/);
  if (!title || !description) return null;
  return { title: JSON.parse(title[1]), description: JSON.parse(description[1]) };
}
