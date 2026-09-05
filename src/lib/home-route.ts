export function homeRouteForRole(role: unknown) {
  return String(role || "").trim().toUpperCase() === "OWNER" ? "/nexus-os/morning-brief" : "/today";
}

export const HOME_ROUTE_FALLBACK = "/nexus-os/morning-brief";
