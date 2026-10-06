const PDF_SAFE_FONT = "Helvetica";

export function isSvgLogoSource(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^data:image\/svg\+xml(?:;|,)/i.test(trimmed)) return true;

  try {
    return new URL(trimmed).pathname.toLowerCase().endsWith(".svg");
  } catch {
    return /\.svg(?:$|[?#])/i.test(trimmed);
  }
}

/**
 * React-PDF does not understand browser CSS font fallback stacks inside SVG
 * text nodes (for example "Georgia, 'Times New Roman', serif"). It treats the
 * complete stack as one font family and throws unless that exact family is
 * registered. Brand SVGs are web assets, so normalize every SVG font-family
 * declaration to React-PDF's built-in Helvetica before rendering.
 */
export function sanitizeSvgFontsForReactPdf(svg: string): string {
  return svg
    .replace(/font-family\s*=\s*(["'])[^"']*\1/gi, `font-family="${PDF_SAFE_FONT}"`)
    .replace(/font-family\s*:\s*[^;}"']+/gi, `font-family: ${PDF_SAFE_FONT}`);
}

export function svgToReactPdfDataUri(svg: string): string {
  const sanitized = sanitizeSvgFontsForReactPdf(svg);
  return `data:image/svg+xml;base64,${Buffer.from(sanitized, "utf8").toString("base64")}`;
}
