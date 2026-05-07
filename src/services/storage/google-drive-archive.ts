import { Readable } from "stream";
import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSupabasePublicUrl } from "@/services/storage/media";

type ArchiveCandidate = {
  table: "content_publications" | "ad_creatives" | "plot_assets" | "user_image_bank" | "songs";
  id: string;
  url: string;
  name: string;
  brand?: string | null;
  status?: string | null;
};

function sanitizeFolderName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "Unsorted";
}

async function getDriveRefreshToken(supabase: SupabaseClient) {
  if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN) return process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

  const { data } = await supabase
    .from("brand_settings")
    .select("settings")
    .eq("brand_id", "_system")
    .maybeSingle();

  return data?.settings?.google_drive_refresh_token || data?.settings?.youtube_refresh_token || null;
}

async function getDriveClient(supabase: SupabaseClient) {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = await getDriveRefreshToken(supabase);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Drive mangler OAuth. Kjor /api/oauth/google?brand=_system etter at Drive-scope er deployet, eller sett GOOGLE_DRIVE_REFRESH_TOKEN.");
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: oauth2 });
}

async function ensureFolder(drive: ReturnType<typeof google.drive>, name: string, parentId?: string) {
  const q = [
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    `name='${name.replace(/'/g, "\\'")}'`,
    parentId ? `'${parentId}' in parents` : undefined,
  ].filter(Boolean).join(" and ");

  const existing = await drive.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 1,
    supportsAllDrives: true,
  });
  const id = existing.data.files?.[0]?.id;
  if (id) return id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error(`Kunne ikke lage Drive-mappe: ${name}`);
  return created.data.id;
}

async function uploadToDrive(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  candidate: ArchiveCandidate,
  buffer: Buffer,
  contentType: string,
) {
  const created = await drive.files.create({
    requestBody: {
      name: sanitizeFolderName(candidate.name),
      parents: [folderId],
      description: `Archived from RealtyFlow Supabase: ${candidate.table}/${candidate.id}`,
    },
    media: {
      mimeType: contentType || "application/octet-stream",
      body: Readable.from(buffer),
    },
    fields: "id,webViewLink",
    supportsAllDrives: true,
  });
  return created.data.webViewLink || (created.data.id ? `https://drive.google.com/file/d/${created.data.id}/view` : "");
}

async function loadCandidates(supabase: SupabaseClient, limit: number): Promise<ArchiveCandidate[]> {
  const [content, ads, plots, images, songs] = await Promise.all([
    supabase.from("content_publications").select("id, brand_id, title, ai_image_url, status, archive_status").eq("status", "published").not("ai_image_url", "is", null).neq("archive_status", "archived").limit(limit),
    supabase.from("ad_creatives").select("id, image_url, status, archive_status, scene_id").eq("status", "completed").not("image_url", "is", null).neq("archive_status", "archived").limit(limit),
    supabase.from("plot_assets").select("id, filename, public_url, kind, archive_status").in("kind", ["image", "photo", "video"]).neq("archive_status", "archived").limit(limit),
    supabase.from("user_image_bank").select("id, owner, name, url, kind, archive_status").in("kind", ["image", "product", "variant", "thumbnail"]).neq("archive_status", "archived").limit(limit),
    supabase.from("songs").select("id, name, file_url, youtube_url, status, archive_status").not("youtube_url", "is", null).not("file_url", "is", null).neq("archive_status", "archived").limit(limit),
  ]);

  const candidates: ArchiveCandidate[] = [];
  for (const row of content.data || []) candidates.push({ table: "content_publications", id: row.id, url: row.ai_image_url, name: row.title || `${row.id}.jpg`, brand: row.brand_id, status: row.status });
  for (const row of ads.data || []) candidates.push({ table: "ad_creatives", id: row.id, url: row.image_url, name: `${row.scene_id || row.id}.png`, brand: "ad-creatives", status: row.status });
  for (const row of plots.data || []) candidates.push({ table: "plot_assets", id: row.id, url: row.public_url, name: row.filename || `${row.id}`, brand: "plot-assets", status: row.kind });
  for (const row of images.data || []) candidates.push({ table: "user_image_bank", id: row.id, url: row.url, name: row.name || `${row.id}.jpg`, brand: row.owner, status: row.kind });
  for (const row of songs.data || []) candidates.push({ table: "songs", id: row.id, url: row.file_url, name: `${row.name || row.id}.mp3`, brand: "Re-Master Freddy", status: row.status });

  return candidates.slice(0, limit);
}

async function markArchived(supabase: SupabaseClient, candidate: ArchiveCandidate, destination: string) {
  await supabase
    .from(candidate.table)
    .update({
      archive_status: "archived",
      archive_destination: destination,
      archived_at: new Date().toISOString(),
    })
    .eq("id", candidate.id);
}

export async function archivePublishedStorageToDrive(
  supabase: SupabaseClient,
  options: { limit?: number; deleteAfterArchive?: boolean } = {},
) {
  const limit = Math.min(options.limit || 10, 25);
  const drive = await getDriveClient(supabase);
  const root = await ensureFolder(drive, "Supabase");
  const candidates = await loadCandidates(supabase, limit);
  const results: Array<{ id: string; table: string; status: string; destination?: string; error?: string }> = [];

  for (const candidate of candidates) {
    try {
      const parsed = parseSupabasePublicUrl(candidate.url);
      const res = await fetch(candidate.url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`Kunne ikke hente fil (${res.status})`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || "application/octet-stream";

      const bucketFolder = await ensureFolder(drive, sanitizeFolderName(parsed?.bucket || candidate.table), root);
      const brandFolder = await ensureFolder(drive, sanitizeFolderName(candidate.brand || "Unsorted"), bucketFolder);
      const statusFolder = await ensureFolder(drive, sanitizeFolderName(candidate.status || "published"), brandFolder);
      const destination = await uploadToDrive(drive, statusFolder, candidate, buffer, contentType);
      await markArchived(supabase, candidate, destination);

      if (options.deleteAfterArchive && parsed) {
        await supabase.storage.from(parsed.bucket).remove([parsed.path]);
      }
      results.push({ id: candidate.id, table: candidate.table, status: "archived", destination });
    } catch (error) {
      results.push({ id: candidate.id, table: candidate.table, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { processed: results.length, results };
}
