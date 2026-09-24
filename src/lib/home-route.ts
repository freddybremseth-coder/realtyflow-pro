export function homeRouteForRole(role: unknown) {
  const normalized = String(role || "").trim().toUpperCase();
  return normalized === "OWNER" ? "/nexus-os/morning-brief"
    : normalized === "WORKSPACE_MEMBER" ? "/workspace" : "/today";
}

export const HOME_ROUTE_FALLBACK = "/nexus-os/morning-brief";
