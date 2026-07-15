/**
 * Hostinger Reach client — e-mail marketing backend for RealtyFlow.
 *
 * Division of labour (matches the Reach API surface):
 *   - RealtyFlow: manages subscribers (add/list/delete), maps each brand to
 *     its own Reach PROFILE (= sending identity/domain) and drafts campaign
 *     content (news, property price updates, general value content)
 *   - Reach (hPanel): performs the actual sends — upgradeable per profile
 *     when volume grows
 *
 * The API cannot create or send campaigns; drafts produced here are pasted
 * into Reach's campaign editor.
 */

const REACH_API_BASE = "https://developers.hostinger.com/api/reach/v1";

export function isReachConfigured(): boolean {
  return Boolean(process.env.HOSTINGER_API_TOKEN);
}

async function reachFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.HOSTINGER_API_TOKEN;
  if (!token) throw new Error("HOSTINGER_API_TOKEN er ikke konfigurert.");

  const res = await fetch(`${REACH_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (res.status === 204) return {} as T;
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `Reach API feilet (HTTP ${res.status})`);
  }
  return data;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReachContact = {
  uuid: string;
  email: string;
  name?: string | null;
  surname?: string | null;
  subscription_status: "subscribed" | "unsubscribed";
  subscribed_at?: string;
  source?: string | null;
  note?: string | null;
};

export type ReachProfile = {
  uuid: string;
  domain?: string | null;
  [key: string]: unknown;
};

export type ReachSubscription = {
  resource_id?: number;
  status?: string;
  is_trial?: boolean;
  expires_at?: string;
  limits?: {
    subscribers_limit?: number;
    emails_monthly_limit?: number;
    ai_messages_limit?: number;
  };
  profiles?: ReachProfile[];
};

export type ReachGroup = { uuid: string; title: string };

// ─── API wrappers ────────────────────────────────────────────────────────────

export async function listReachSubscriptions(): Promise<ReachSubscription[]> {
  const data = await reachFetch<{ data?: ReachSubscription[] } | ReachSubscription[]>("/profiles");
  const items = Array.isArray(data) ? data : data.data || [];
  return items;
}

/** Flat list of sending profiles across all Reach subscriptions. */
export async function listReachProfiles(): Promise<Array<ReachProfile & { limits?: ReachSubscription["limits"] }>> {
  const subscriptions = await listReachSubscriptions();
  const profiles: Array<ReachProfile & { limits?: ReachSubscription["limits"] }> = [];
  for (const subscription of subscriptions) {
    for (const profile of subscription.profiles || []) {
      profiles.push({ ...profile, limits: subscription.limits });
    }
  }
  return profiles;
}

export async function listReachContacts(params: { page?: number; perPage?: number } = {}): Promise<{
  contacts: ReachContact[];
  total: number;
  page: number;
}> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.perPage) query.set("per_page", String(params.perPage));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await reachFetch<{ data?: ReachContact[]; meta?: { total?: number; current_page?: number } }>(
    `/contacts${suffix}`,
  );
  return {
    contacts: data.data || [],
    total: data.meta?.total ?? (data.data || []).length,
    page: data.meta?.current_page ?? 1,
  };
}

export type ReachContactInput = {
  email: string;
  name?: string;
  surname?: string;
  phone?: string;
  note?: string;
};

/** Create a contact — in a specific brand profile when profileUuid is set. */
export async function createReachContact(contact: ReachContactInput, profileUuid?: string): Promise<void> {
  const path = profileUuid ? `/profiles/${profileUuid}/contacts` : "/contacts";
  await reachFetch(path, { method: "POST", body: JSON.stringify(contact) });
}

export async function deleteReachContact(uuid: string): Promise<void> {
  await reachFetch(`/contacts/${uuid}`, { method: "DELETE" });
}

export async function listReachGroups(): Promise<ReachGroup[]> {
  const data = await reachFetch<{ data?: ReachGroup[] } | ReachGroup[]>("/contacts/groups");
  return Array.isArray(data) ? data : data.data || [];
}

export async function getReachDnsStatus(profileUuid: string): Promise<Record<string, unknown>> {
  return reachFetch<Record<string, unknown>>(`/profiles/${profileUuid}/domains/dns-status`);
}
