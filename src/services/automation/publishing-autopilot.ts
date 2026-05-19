import type { SupabaseClient } from "@supabase/supabase-js";

type WorkItem = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  brand_id?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  assigned_agent?: string | null;
  next_action?: string | null;
  ai_score?: number | null;
  metadata?: Record<string, unknown> | null;
};

function buildPublishingDraft(item: WorkItem) {
  const lines = [
    "Mål:",
    item.description || "Optimaliser boken for bedre synlighet, CTR og konvertering.",
    "",
    "AI-forslag:",
    "1) Oppdater tittel/undertittel med tydelig reader-intent",
    "2) Skriv trygg Amazon-beskrivelse uten medisinske garantier",
    "3) Forslå 7 backend-keywords",
    "4) Foreslå 3 relevante KDP-kategorier",
    "5) Definer review-loop og annonserings-test",
    "",
    "Neste handling:",
    item.next_action || "Godkjenn eller rediger forslaget, og send videre til publisering.",
  ];

  return {
    title: `AI-utkast: ${item.title}`,
    description: lines.join("\n"),
    tags: ["publishing", "kdp", "amazon", "metadata", "ai-autopilot"],
  };
}

export async function runPublishingAutopilot(
  supabase: SupabaseClient,
  options: { limit?: number } = {},
) {
  const limit = Math.min(Math.max(Number(options.limit || 5), 1), 20);

  const { data: items, error } = await supabase
    .from("work_items")
    .select("id,title,description,status,priority,brand_id,source_type,source_id,assigned_agent,next_action,ai_score,metadata")
    .in("source_type", ["kdp", "publishing", "manual"])
    .eq("status", "TO_DO")
    .or("assigned_agent.eq.publishing,brand_id.eq.freddypublishing")
    .order("ai_score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!items?.length) return { processed: 0, moved_to_review: 0, drafts_created: 0, items: [] };

  const results: Array<{ id: string; status: string; draft_id?: string; error?: string }> = [];
  let movedToReview = 0;
  let draftsCreated = 0;

  for (const item of items as WorkItem[]) {
    try {
      await supabase
        .from("work_items")
        .update({ status: "IN_PROGRESS", updated_at: new Date().toISOString() })
        .eq("id", item.id);

      const draft = buildPublishingDraft(item);
      const { data: createdDraft, error: draftError } = await supabase
        .from("content_publications")
        .insert({
          brand_id: item.brand_id || "freddypublishing",
          content_type: "text",
          title: draft.title,
          description: draft.description,
          tags: draft.tags,
          status: "draft",
          ai_generated: true,
        })
        .select("id")
        .single();

      if (draftError) throw draftError;
      draftsCreated += 1;

      const metadata = typeof item.metadata === "object" && item.metadata ? item.metadata : {};
      const autopilotMeta = {
        ...(metadata as Record<string, unknown>),
        autopilot: {
          processor: "publishing_autopilot_v1",
          processed_at: new Date().toISOString(),
          draft_id: createdDraft?.id || null,
        },
      };

      const { error: updateError } = await supabase
        .from("work_items")
        .update({
          status: "REVIEW",
          next_action: "Se AI-utkast i Content Hub, godkjenn og send til publisering.",
          metadata: autopilotMeta,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (updateError) throw updateError;
      movedToReview += 1;
      results.push({ id: item.id, status: "review", draft_id: createdDraft?.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("work_items")
        .update({
          status: "TO_DO",
          next_action: `Autopilot feilet: ${message.slice(0, 120)}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      results.push({ id: item.id, status: "error", error: message });
    }
  }

  return {
    processed: results.length,
    moved_to_review: movedToReview,
    drafts_created: draftsCreated,
    items: results,
  };
}

