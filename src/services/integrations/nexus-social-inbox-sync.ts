import { createClient } from "@supabase/supabase-js";
import { getDecryptedTokens } from "@/lib/oauth/channels";
import { evaluateMetaCapabilities } from "@/lib/oauth/meta-capabilities";
import { fetchFacebookPostComments, fetchInstagramMediaComments } from "@/services/integrations/meta-comment-inbox";

export type SocialInboxSyncResult = {
  success: true;
  readOnly: true;
  skipped?: boolean;
  reason?: string;
  commentsFetched: number;
  conversationsUpserted: number;
  messagesUpserted: number;
  results: Array<Record<string, unknown>>;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function runReadOnlySocialInboxSync(input: { source: "cron" | "manual" }): Promise<SocialInboxSyncResult> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");

  const { data: runtime, error: runtimeError } = await supabase
    .from("nexus_runtime_controls")
    .select("enabled,config")
    .eq("control_key", "feature:social_inbox_sync")
    .maybeSingle();
  if (runtimeError) throw new Error(runtimeError.message);
  if (!runtime?.enabled) {
    return { success: true, readOnly: true, skipped: true, reason: "feature:social_inbox_sync is disabled", commentsFetched: 0, conversationsUpserted: 0, messagesUpserted: 0, results: [] };
  }

  const maxPerRun = Math.max(1, Math.min(100, Number((runtime.config as any)?.max_per_run || 50)));
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: channels, error: channelError }, { data: publications, error: pubError }] = await Promise.all([
    supabase.from("social_channels").select("id,brand_id,platform,external_id,display_name,is_active").eq("is_active", true).in("platform", ["facebook", "instagram"]),
    supabase.from("content_publications").select("id,brand_id,facebook_post_id,instagram_post_id,published_at").eq("status", "published").gte("published_at", since).order("published_at", { ascending: false }).limit(250),
  ]);
  if (channelError) throw new Error(channelError.message);
  if (pubError) throw new Error(pubError.message);

  const results: Array<Record<string, unknown>> = [];
  let commentsFetched = 0;
  let messagesUpserted = 0;
  let conversationsUpserted = 0;

  for (const channel of channels ?? []) {
    const tokens = await getDecryptedTokens(String(channel.id)).catch(() => null);
    if (!tokens) {
      results.push({ channelId: channel.id, brandId: channel.brand_id, platform: channel.platform, skipped: "missing_token" });
      continue;
    }
    const capabilities = evaluateMetaCapabilities(String(channel.platform), tokens.scopes);
    if (!capabilities.readComments) {
      results.push({ channelId: channel.id, brandId: channel.brand_id, platform: channel.platform, skipped: "missing_read_comments_capability" });
      continue;
    }

    const posts = (publications ?? []).filter((p: any) => String(p.brand_id) === String(channel.brand_id));
    let channelFetched = 0;
    let channelUpserted = 0;

    for (const post of posts) {
      if (channelFetched >= maxPerRun) break;
      const postId = channel.platform === "facebook" ? post.facebook_post_id : post.instagram_post_id;
      if (!postId) continue;
      try {
        const remaining = Math.max(1, maxPerRun - channelFetched);
        const comments = channel.platform === "facebook"
          ? await fetchFacebookPostComments(String(postId), tokens.accessToken, remaining)
          : await fetchInstagramMediaComments(String(postId), tokens.accessToken, remaining);

        for (const comment of comments.slice(0, remaining)) {
          const isOutbound = Boolean(comment.authorExternalId && String(comment.authorExternalId) === String(channel.external_id));
          const syncedAt = new Date().toISOString();
          const { data: conversation, error: conversationError } = await supabase
            .from("nexus_social_conversations")
            .upsert({
              brand_id: channel.brand_id,
              social_channel_id: channel.id,
              platform: channel.platform,
              conversation_type: "comment_thread",
              external_conversation_id: comment.id,
              external_post_id: String(postId),
              participant_external_id: isOutbound ? null : comment.authorExternalId,
              participant_name: isOutbound ? null : comment.authorName,
              status: "open",
              last_inbound_at: isOutbound ? null : (comment.occurredAt || syncedAt),
              last_outbound_at: isOutbound ? (comment.occurredAt || syncedAt) : null,
              last_synced_at: syncedAt,
              metadata: { source: "meta_graph", publication_id: post.id, read_only_sync: true },
              updated_at: syncedAt,
            }, { onConflict: "social_channel_id,conversation_type,external_conversation_id" })
            .select("id")
            .single();
          if (conversationError || !conversation) continue;
          conversationsUpserted++;

          const { error: messageError } = await supabase
            .from("nexus_social_messages")
            .upsert({
              conversation_id: conversation.id,
              social_channel_id: channel.id,
              brand_id: channel.brand_id,
              platform: channel.platform,
              external_message_id: comment.id,
              direction: isOutbound ? "outbound" : "inbound",
              author_external_id: comment.authorExternalId,
              author_name: comment.authorName,
              body_text: comment.text || null,
              raw_payload: comment.raw,
              received_at: isOutbound ? null : comment.occurredAt,
              sent_at: isOutbound ? comment.occurredAt : null,
            }, { onConflict: "social_channel_id,external_message_id" });
          if (!messageError) {
            messagesUpserted++;
            channelUpserted++;
          }
        }
        channelFetched += comments.length;
        commentsFetched += comments.length;
      } catch (error) {
        results.push({ channelId: channel.id, brandId: channel.brand_id, platform: channel.platform, postId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    results.push({ channelId: channel.id, brandId: channel.brand_id, platform: channel.platform, fetched: channelFetched, upserted: channelUpserted });
  }

  await supabase.from("automation_logs").insert({
    action: "social_inbox_sync",
    agent_name: input.source === "cron" ? "nexus_social_inbox_sync_cron" : "nexus_social_inbox_sync_manual",
    status: results.some((r) => r.error) ? "partial" : "success",
    details: { source: input.source, comments_fetched: commentsFetched, conversations_upserted: conversationsUpserted, messages_upserted: messagesUpserted, runtime_control: "feature:social_inbox_sync", read_only: true },
  });

  return { success: true, readOnly: true, commentsFetched, conversationsUpserted, messagesUpserted, results };
}
