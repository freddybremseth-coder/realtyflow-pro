import "server-only";
import { getPlatformSupabase } from "@/lib/platform/supabase";

export type WorkspaceDirectoryUser = {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  status: "active" | "disabled";
};

function parseDirectoryUser(value: unknown): WorkspaceDirectoryUser | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const userId = String(row.user_id || "");
  const username = String(row.username || "").trim().toLowerCase();
  const email = String(row.email || "").trim().toLowerCase();
  const displayName = String(row.display_name || "").trim();
  const status = row.status === "active" || row.status === "disabled" ? row.status : null;
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(userId) ||
      !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !displayName || !status) return null;
  return { userId, username, email, displayName, status };
}

export async function resolveWorkspaceLogin(login: string) {
  const value = String(login || "").trim().toLowerCase();
  if (!value || value.length > 254) return { user: null, error: null as string | null };
  const supabase = getPlatformSupabase();
  if (!supabase) return { user: null, error: "Supabase not configured" };
  const { data, error } = await supabase.rpc("workspace_login_directory", { p_login: value });
  if (error) return { user: null, error: error.message || "Workspace directory unavailable" };
  if (!data) return { user: null, error: null as string | null };
  const user = parseDirectoryUser(data);
  return user ? { user, error: null as string | null }
    : { user: null, error: "Invalid workspace directory response" };
}

export async function findWorkspaceDirectoryByEmail(email: string) {
  return resolveWorkspaceLogin(String(email || "").trim().toLowerCase());
}

export async function verifyWorkspaceDirectorySession(email: string) {
  const resolved = await findWorkspaceDirectoryByEmail(email);
  if (resolved.error || !resolved.user || resolved.user.status !== "active") {
    return { user: null, error: resolved.error || "Inactive workspace user" };
  }
  const supabase = getPlatformSupabase();
  if (!supabase) return { user: null, error: "Supabase not configured" };
  const { data, error } = await supabase.auth.admin.getUserById(resolved.user.userId);
  const authEmail = data?.user?.email?.trim().toLowerCase() || "";
  if (error || !data?.user || authEmail !== resolved.user.email) {
    return { user: null, error: "Workspace auth identity mismatch" };
  }
  return { user: resolved.user, error: null as string | null };
}
