/** Conservative prompt budget for Elena: prevent oversized CRM/inventory payloads.
 * This changes only what is sent to the model, not database queries or CRM state. */
function clip(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
function matchFirst(rows: Record<string, unknown>[], test: (row: Record<string, unknown>) => boolean, limit: number) {
  const selected = new Set<Record<string, unknown>>();
  for (const row of rows) if (test(row)) selected.add(row);
  for (const row of rows) if (selected.size < limit) selected.add(row);
  return [...selected].slice(0, limit);
}
function pick(row: Record<string, unknown>, names: string[]) {
  const output: Record<string, unknown> = {};
  for (const name of names) {
    const value = row[name];
    if (value === null || value === undefined) continue;
    if (typeof value === "string") output[name] = clip(value, name === "notes" ? 240 : 140);
    else if (typeof value === "number" || typeof value === "boolean") output[name] = value;
  }
  return output;
}
export function boundedElenaEmailText(value: unknown, max = 16000) {
  const raw = String(value ?? "");
  const text = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return clip(text, max);
}
export function prepareElenaMatchContext(input: {
  emailContent: string;
  fromAddress: string;
  leads: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  properties: Record<string, unknown>[];
  plots: Record<string, unknown>[];
}) {
  const source = boundedElenaEmailText(input.emailContent, 12000);
  const email = clip(input.fromAddress, 200).toLowerCase();
  const exactSender = (row: Record<string, unknown>) => !!email && clip(row.email, 200).toLowerCase() === email;
  const propertyMention = (row: Record<string, unknown>) => {
    const refs = [row.ref, row.id].map(value => clip(value, 140).toLowerCase()).filter(value => value.length >= 4);
    return refs.some(ref => source.toLowerCase().includes(ref));
  };
  return {
    emailContent: source,
    leads: matchFirst(input.leads, exactSender, 60).map(row =>
      pick(row, ["id", "name", "email", "phone", "status", "budget", "notes"])),
    customers: matchFirst(input.customers, exactSender, 60).map(row =>
      pick(row, ["id", "name", "email", "phone", "status", "type", "notes"])),
    properties: matchFirst(input.properties, propertyMention, 40).map(row =>
      pick(row, ["id", "ref", "title", "location", "price", "type", "bedrooms", "bathrooms", "area", "plot_size", "nexus_match_score", "nexus_match_label"])),
    plots: input.plots.slice(0, 20).map(row =>
      pick(row, ["id", "ref", "location", "price", "area", "plot_size"])),
  };
}
