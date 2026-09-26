/** Static public HTML evidence only. Never a WCAG, ranking or AI-citation score. */
export type SEOPageQuality = {
  language: string | null;
  mobileViewport: boolean;
  images: number;
  imagesWithoutAlt: number;
  structuredDataBlocks: number;
  invalidStructuredDataBlocks: number;
  contactLinkPresent: boolean;
  formPresent: boolean;
};

function attributes(tag: string): Record<string, string> {
  const values: Record<string, string> = Object.create(null);
  for (const match of tag.matchAll(/\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    values[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return values;
}

export function inspectPageQuality(source: string): SEOPageQuality {
  const html = source.replace(/<!--[\s\S]*?-->/g, "").replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, "");
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => attributes("<script " + match[1] + ">").type?.toLowerCase() === "application/ld+json");
  const visible = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const images = [...visible.matchAll(/<img\b[^>]*>/gi)].map(match => attributes(match[0]));
  return {
    language: attributes(visible.match(/<html\b[^>]*>/i)?.[0] || "").lang?.trim() || null,
    mobileViewport: [...visible.matchAll(/<meta\b[^>]*>/gi)].some(match => {
      const attrs = attributes(match[0]);
      return attrs.name?.toLowerCase() === "viewport" && /\bwidth\s*=\s*device-width\b/i.test(attrs.content || "");
    }),
    images: images.length,
    // Empty alt is valid for decorative images; never auto-invent descriptions.
    imagesWithoutAlt: images.filter(attrs => !("alt" in attrs)).length,
    structuredDataBlocks: blocks.length,
    invalidStructuredDataBlocks: blocks.filter(match => {
      try { JSON.parse(match[2]); return false; } catch { return true; }
    }).length,
    contactLinkPresent: [...visible.matchAll(/<a\b[^>]*>/gi)].some(match => {
      const href = attributes(match[0]).href || "";
      return /^(?:mailto:|tel:)/i.test(href) ||
        /(?:^|\/)(?:kontakt|contact|contacto|booking|book-a-viewing)(?:[\/#?]|$)/i.test(href);
    }),
    formPresent: /<form\b/i.test(visible),
  };
}
