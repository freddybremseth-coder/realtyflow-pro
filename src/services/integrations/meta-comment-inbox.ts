const GRAPH = "https://graph.facebook.com/v25.0";

export type MetaComment = {
  id: string;
  text: string;
  occurredAt: string | null;
  authorExternalId: string | null;
  authorName: string | null;
  raw: Record<string, unknown>;
};

type GraphList<T> = { data?: T[]; paging?: { next?: string }; error?: { message?: string } };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error?.message || `Meta Graph HTTP ${res.status}`);
  return body as T;
}

export async function fetchFacebookPostComments(postId: string, accessToken: string, limit = 100): Promise<MetaComment[]> {
  const url = new URL(`${GRAPH}/${encodeURIComponent(postId)}/comments`);
  url.searchParams.set("fields", "id,message,created_time,from{id,name}");
  url.searchParams.set("limit", String(Math.max(1, Math.min(100, limit))));
  url.searchParams.set("access_token", accessToken);
  const body = await fetchJson<GraphList<any>>(url.toString());
  return (body.data ?? []).map((row: any) => ({
    id: String(row.id),
    text: String(row.message || ""),
    occurredAt: row.created_time ? String(row.created_time) : null,
    authorExternalId: row.from?.id ? String(row.from.id) : null,
    authorName: row.from?.name ? String(row.from.name) : null,
    raw: row,
  })).filter((row) => row.id);
}

export async function fetchInstagramMediaComments(mediaId: string, accessToken: string, limit = 100): Promise<MetaComment[]> {
  const url = new URL(`${GRAPH}/${encodeURIComponent(mediaId)}/comments`);
  url.searchParams.set("fields", "id,text,timestamp,username,from");
  url.searchParams.set("limit", String(Math.max(1, Math.min(100, limit))));
  url.searchParams.set("access_token", accessToken);
  const body = await fetchJson<GraphList<any>>(url.toString());
  return (body.data ?? []).map((row: any) => ({
    id: String(row.id),
    text: String(row.text || ""),
    occurredAt: row.timestamp ? String(row.timestamp) : null,
    authorExternalId: row.from?.id ? String(row.from.id) : null,
    authorName: row.username ? String(row.username) : row.from?.username ? String(row.from.username) : null,
    raw: row,
  })).filter((row) => row.id);
}
