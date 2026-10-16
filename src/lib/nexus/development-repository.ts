/** Approved repository targets for development intake; never accept arbitrary repo URLs from chat. */
export const DEVELOPMENT_REPOSITORIES = {
  realtyflow: "freddybremseth-coder/realtyflow-pro",
  altovena: "freddybremseth-coder/Altovena",
} as const;

export type DevelopmentRepositoryKey = keyof typeof DEVELOPMENT_REPOSITORIES;

export function suggestDevelopmentRepository(input: {
  brandKey?: string | null;
  pagePath?: string | null;
  request?: string | null;
}): DevelopmentRepositoryKey {
  const brand = String(input.brandKey || "").toLowerCase();
  const page = String(input.pagePath || "").toLowerCase();
  const description = String(input.request || "").toLowerCase();
  if (brand === "altovena" || page.startsWith("/altovena") || /\baltovena\b/i.test(description)) {
    return "altovena";
  }
  return "realtyflow";
}

export function resolveDevelopmentRepository(key: unknown): string | null {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(DEVELOPMENT_REPOSITORIES, key)
    ? DEVELOPMENT_REPOSITORIES[key as DevelopmentRepositoryKey]
    : null;
}
