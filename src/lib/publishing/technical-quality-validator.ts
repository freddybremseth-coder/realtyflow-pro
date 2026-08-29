import JSZip from "jszip";

export const DETERMINISTIC_QUALITY_CHECKS = ["epub_validation", "accessibility", "metadata"] as const;
export type DeterministicQualityCheckType = typeof DETERMINISTIC_QUALITY_CHECKS[number];

export type TechnicalFinding = {
  severity: "error" | "warning";
  code: string;
  location: string;
  message: string;
};

export type TechnicalQualityResult = {
  result: "pass" | "warning" | "fail";
  score: number;
  summary: string;
  evidence: {
    validator: string;
    validatorVersion: string;
    checkedAt: string;
    fileBytes?: number;
    inspectedFiles?: string[];
    findings: TechnicalFinding[];
  };
};

function finding(findings: TechnicalFinding[], severity: TechnicalFinding["severity"], code: string, location: string, message: string) {
  findings.push({ severity, code, location, message });
}

function finish(type: DeterministicQualityCheckType, findings: TechnicalFinding[], extra: Partial<TechnicalQualityResult["evidence"]> = {}): TechnicalQualityResult {
  const errors = findings.filter((row) => row.severity === "error").length;
  const warnings = findings.length - errors;
  const result = errors ? "fail" : warnings ? "warning" : "pass";
  const labels = { epub_validation: "EPUB-strukturen", accessibility: "Tilgjengeligheten", metadata: "Metadataene" };
  return {
    result,
    score: Math.max(0, 100 - errors * 25 - warnings * 5),
    summary: errors ? `${labels[type]} har ${errors} feil og ${warnings} advarsler.` : warnings ? `${labels[type]} har ${warnings} advarsler.` : `${labels[type]} besto alle målbare kontroller.`,
    evidence: { validator: "realtyflow-book-os", validatorVersion: "1.0.0", checkedAt: new Date().toISOString(), findings, ...extra },
  };
}

function contains(source: string, pattern: RegExp) {
  return pattern.test(source);
}

async function loadEpub(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  const files = Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort();
  const read = async (name: string) => zip.file(name)?.async("string") ?? "";
  return { zip, files, read };
}

export async function validateEpubStructure(buffer: Buffer): Promise<TechnicalQualityResult> {
  const findings: TechnicalFinding[] = [];
  try {
    const { zip, files, read } = await loadEpub(buffer);
    if ((await read("mimetype")) !== "application/epub+zip") finding(findings, "error", "EPUB_MIMETYPE", "mimetype", "Mimetype mangler eller har feil verdi.");
    const container = await read("META-INF/container.xml");
    if (!container) finding(findings, "error", "EPUB_CONTAINER", "META-INF/container.xml", "Container-filen mangler.");
    const rootfile = container.match(/full-path=["']([^"']+)["']/)?.[1] ?? "";
    if (!rootfile || !zip.file(rootfile)) finding(findings, "error", "EPUB_ROOTFILE", "META-INF/container.xml", "OPF-rootfilen kan ikke finnes.");
    const opf = rootfile ? await read(rootfile) : "";
    for (const [code, pattern, label] of [
      ["EPUB_VERSION", /<package[^>]+version=["']3\.0["']/, "EPUB 3.0 package"],
      ["EPUB_IDENTIFIER", /<dc:identifier\b[^>]*>\s*[^<]+/, "identifier"],
      ["EPUB_TITLE", /<dc:title\b[^>]*>\s*[^<]+/, "title"],
      ["EPUB_LANGUAGE", /<dc:language\b[^>]*>\s*[^<]+/, "language"],
      ["EPUB_MODIFIED", /property=["']dcterms:modified["'][^>]*>\s*[^<]+/, "modified timestamp"],
      ["EPUB_NAV", /properties=["'][^"']*\bnav\b[^"']*["']/, "navigation document"],
      ["EPUB_SPINE", /<spine\b[^>]*>[\s\S]*?<itemref\b/, "reading spine"],
    ] as const) if (!contains(opf, pattern)) finding(findings, "error", code, rootfile || "content.opf", `Påkrevd ${label} mangler.`);
    const hrefs = [...opf.matchAll(/<item\b[^>]*href=["']([^"']+)["'][^>]*>/g)].map((match) => match[1]);
    const rootDir = rootfile.includes("/") ? rootfile.slice(0, rootfile.lastIndexOf("/") + 1) : "";
    for (const href of hrefs) if (!zip.file(`${rootDir}${href}`)) finding(findings, "error", "EPUB_MANIFEST_TARGET", `${rootDir}${href}`, "Manifestet peker til en fil som ikke finnes.");
    return finish("epub_validation", findings, { fileBytes: buffer.length, inspectedFiles: files });
  } catch (error) {
    finding(findings, "error", "EPUB_ARCHIVE", "archive", error instanceof Error ? error.message : "EPUB-arkivet kunne ikke leses.");
    return finish("epub_validation", findings, { fileBytes: buffer.length });
  }
}

export async function validateEpubAccessibility(buffer: Buffer): Promise<TechnicalQualityResult> {
  const findings: TechnicalFinding[] = [];
  try {
    const { files, read } = await loadEpub(buffer);
    const opfName = files.find((name) => name.endsWith(".opf")) ?? "";
    const opf = opfName ? await read(opfName) : "";
    const navName = files.find((name) => /(?:^|\/)nav\.xhtml$/i.test(name)) ?? "";
    const nav = navName ? await read(navName) : "";
    if (!contains(opf, /schema:accessMode/)) finding(findings, "error", "A11Y_ACCESS_MODE", opfName, "accessMode-metadata mangler.");
    if (!contains(opf, /schema:accessibilityFeature/)) finding(findings, "error", "A11Y_FEATURES", opfName, "Tilgjengelighetsfunksjoner er ikke deklarert.");
    if (!contains(opf, /schema:accessibilityHazard/)) finding(findings, "error", "A11Y_HAZARD", opfName, "Tilgjengelighetsfarer er ikke deklarert.");
    if (!contains(opf, /schema:accessibilitySummary/)) finding(findings, "warning", "A11Y_SUMMARY", opfName, "Tilgjengelighetssammendrag mangler.");
    if (!contains(nav, /epub:type=["']toc["']/)) finding(findings, "error", "A11Y_TOC", navName, "Navigerbar innholdsfortegnelse mangler.");
    if (!contains(nav, /epub:type=["']landmarks["']/)) finding(findings, "warning", "A11Y_LANDMARKS", navName, "Landemerkenavigasjon mangler.");
    for (const name of files.filter((file) => file.endsWith(".xhtml"))) {
      const xhtml = await read(name);
      if (!/<html\b[^>]*\blang=["'][^"']+["']/.test(xhtml)) finding(findings, "error", "A11Y_LANGUAGE", name, "Dokumentspråk mangler.");
      for (const image of xhtml.matchAll(/<img\b[^>]*>/g)) if (!/\balt=["'][^"']*["']/.test(image[0])) finding(findings, "error", "A11Y_IMAGE_ALT", name, "Et bilde mangler alt-tekst.");
    }
    return finish("accessibility", findings, { fileBytes: buffer.length, inspectedFiles: files });
  } catch (error) {
    finding(findings, "error", "A11Y_ARCHIVE", "archive", error instanceof Error ? error.message : "EPUB-arkivet kunne ikke leses.");
    return finish("accessibility", findings, { fileBytes: buffer.length });
  }
}

export function validatePublishingMetadata(project: Record<string, any>): TechnicalQualityResult {
  const findings: TechnicalFinding[] = [];
  const metadata = project.metadata_plan && typeof project.metadata_plan === "object" ? project.metadata_plan : {};
  const kdp = metadata.kdp && typeof metadata.kdp === "object" ? metadata.kdp : metadata;
  const required = [
    ["META_TITLE", "title", project.title], ["META_AUTHOR", "metadata.author", metadata.author], ["META_LANGUAGE", "language", project.language],
    ["META_DESCRIPTION", "metadata.description", kdp.description_html || kdp.description],
  ] as const;
  for (const [code, location, value] of required) if (!String(value ?? "").trim()) finding(findings, "error", code, location, "Påkrevd publiseringsmetadata mangler.");
  const description = String(kdp.description_html || kdp.description || "").replace(/<[^>]+>/g, " ").trim();
  if (description && description.length < 100) finding(findings, "warning", "META_DESCRIPTION_SHORT", "metadata.description", "Beskrivelsen er kortere enn 100 tegn.");
  if (!String(project.subtitle ?? "").trim()) finding(findings, "warning", "META_SUBTITLE", "subtitle", "Undertittel mangler; vurder om utgaven trenger en.");
  return finish("metadata", findings);
}

export async function runDeterministicQualityCheck(type: DeterministicQualityCheckType, project: Record<string, any>, epub: Buffer) {
  if (type === "epub_validation") return validateEpubStructure(epub);
  if (type === "accessibility") return validateEpubAccessibility(epub);
  return validatePublishingMetadata(project);
}
