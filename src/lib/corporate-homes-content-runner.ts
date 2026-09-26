import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCorporateOrganicCopy,
  corporateOrganicTopicsForWeek,
} from "@/lib/corporate-organic-content";

export const CORPORATE_CONTENT_ACTION = "corporate_homes_content_drafts";
export const CORPORATE_CONTENT_PATH = "/api/cron/corporate-homes-content-drafts";

function weekKey(date: Date) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const days = Math.floor((date.getTime() - first.getTime()) / 86400000);
  const week = Math.ceil((days + first.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function runCorporateHomesContentDrafts(
  supabase: SupabaseClient,
  options: { now?: Date; trigger?: "cron" | "manual" } = {},
) {
  const now = options.now || new Date();
  const trigger = options.trigger || "cron";
  const key = weekKey(now);
  const topics = corporateOrganicTopicsForWeek(now);

  const { data: existing, error: existingError } = await supabase
    .from("content_publications")
    .select("id,title,status,created_at")
    .eq("brand_id", "zeneco")
    .eq("content_type", "corporate_article_post")
    .ilike("title", `Zen Corporate Homes · ${key}%`)
    .limit(20);

  if (existingError) throw existingError;

  const existingTitles = new Set((existing || []).map((row: any) => String(row.title || "")));
  const created: Array<{ id: string; title: string; topic: string }> = [];
  const skipped: Array<{ title: string; reason: string }> = [];

  for (let index = 0; index < topics.length; index += 1) {
    const topic = topics[index];
    const title = `Zen Corporate Homes · ${key} · ${index + 1} · ${topic.title}`;

    if (existingTitles.has(title)) {
      skipped.push({ title, reason: "already_exists" });
      continue;
    }

    const copy = buildCorporateOrganicCopy(topic);
    const description = [
      copy.linkedin,
      "",
      "—",
      "Facebook-variant:",
      copy.facebook,
    ].join("\n");

    const { data, error } = await supabase
      .from("content_publications")
      .insert({
        brand_id: "zeneco",
        content_type: "corporate_article_post",
        title,
        description,
        tags: ["zen-corporate-homes", "bedriftshytte-spania", "b2b", topic.slug],
        status: "draft",
        ai_generated: false,
        ai_title: topic.title,
        ai_description: description,
        ai_tags: ["zen-corporate-homes", "bedriftshytte-spania", "b2b"],
        scheduled_platforms: ["linkedin", "facebook"],
      })
      .select("id,title")
      .single();

    if (error) throw error;
    created.push({ id: String(data.id), title: String(data.title), topic: topic.slug });
  }

  const details = {
    trigger,
    week: key,
    requested: topics.length,
    created: created.length,
    skipped: skipped.length,
    status: "draft",
    platforms: ["linkedin", "facebook"],
    external_publish_started: false,
    topics: topics.map((topic) => topic.slug),
  };

  await supabase.from("automation_logs").insert({
    action: CORPORATE_CONTENT_ACTION,
    agent_name: "Zen Corporate Homes",
    status: "success",
    details,
    created_at: new Date().toISOString(),
  });

  return { success: true, ...details, createdRows: created, skippedRows: skipped };
}
