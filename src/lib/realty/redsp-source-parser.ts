export interface RedspEditorialSourceRow {
  ref: string;
  source_description: string | null;
  amenities_no: string[];
  floor_label: string | null;
  usage_source: string | null;
}

function decodeXml(value: string): string {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1")
    .replace(/&#13;|&#x0*d;/gi, "\n")
    .replace(/&#10;|&#x0*a;/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function directTag(block: string, tag: string): string {
  const escaped = escapeRegExp(tag);
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function nestedLanguageTag(block: string, container: string, preferred = "no"): string {
  const escaped = escapeRegExp(container);
  const containerMatch = block.match(
    new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"),
  );
  if (!containerMatch) return "";
  const inner = containerMatch[1];
  for (const language of [preferred, "en", "es"]) {
    const value = directTag(inner, language);
    if (value) return value;
  }
  return decodeXml(inner);
}

function allTagValues(block: string, tag: string): string[] {
  const escaped = escapeRegExp(tag);
  const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi");
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(block))) {
    const value = decodeXml(match[1]);
    if (value) values.push(value);
  }
  return Array.from(new Set(values));
}

function firstNonEmpty(...values: string[]) {
  return values.find((value) => value.trim())?.trim() || "";
}

export function extractRedspEditorialSourceRows(xmlText: string): RedspEditorialSourceRow[] {
  const propertyRegex = /<property(?:\s[^>]*)?>([\s\S]*?)<\/property>/gi;
  const rows: RedspEditorialSourceRow[] = [];
  let match: RegExpExecArray | null;

  while ((match = propertyRegex.exec(xmlText))) {
    const block = match[1];
    const ref = firstNonEmpty(directTag(block, "ref"), directTag(block, "id"));
    if (!ref) continue;

    const description = firstNonEmpty(
      nestedLanguageTag(block, "desc", "no"),
      nestedLanguageTag(block, "description", "no"),
      directTag(block, "desc"),
      directTag(block, "description"),
    );

    const tagsMatch = block.match(/<tags(?:\s[^>]*)?>([\s\S]*?)<\/tags>/i);
    const amenities = tagsMatch ? allTagValues(tagsMatch[1], "tag") : [];
    const floor = firstNonEmpty(
      directTag(block, "floor"),
      directTag(block, "level"),
      directTag(block, "floor_number"),
    );
    const usage = firstNonEmpty(
      directTag(block, "property_use"),
      directTag(block, "usage"),
      directTag(block, "suitable_for"),
      directTag(block, "living_type"),
    );

    rows.push({
      ref,
      source_description: description || null,
      amenities_no: amenities,
      floor_label: floor || null,
      usage_source: usage || null,
    });
  }

  return rows;
}
