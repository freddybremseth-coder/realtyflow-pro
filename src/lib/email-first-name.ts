/**
 * First-name token for customer-facing email copy.
 *
 * Keep the CRM record unchanged and preserve the rest of the name's casing,
 * including accents and deliberately mixed-case names.
 */
export function emailFirstName(value: unknown, fallback = ""): string {
  const first = String(value ?? "").trim().split(/\s+/)[0] || fallback;
  if (!first) return "";
  const [initial, ...rest] = Array.from(first);
  return initial.toLocaleUpperCase("nb-NO") + rest.join("");
}
