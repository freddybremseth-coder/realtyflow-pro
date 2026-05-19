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
  const objective = item.description || "Optimaliser boken for bedre synlighet, CTR og konvertering.";
  const bookTitle = item.title.replace(/^Publishing:\s*/i, "").trim() || item.title;

  return {
    objective,
    title_suggestion: `${bookTitle}: A Mediterranean Guide to Extra Virgin Olive Oil, Polyphenols, and Everyday Heart-Healthy Cooking`,
    subtitle_suggestion:
      "Beginner-friendly framework for better olive oil choices, anti-inflammatory meal patterns, and practical longevity habits.",
    amazon_description_outline: [
      "Hook: hvorfor dette er relevant for leseren nå",
      "Hva boken løser uten overdrivelser",
      "Hva leseren konkret lærer i kapitlene",
      "Kort troverdighetsblokk om forfatter",
      "Tydelig CTA",
    ],
    backend_keywords: [
      "extra virgin olive oil guide",
      "mediterranean diet beginner",
      "heart healthy cooking",
      "anti inflammatory eating",
      "polyphenols antioxidants",
      "longevity nutrition habits",
      "olive oil quality checklist",
    ],
    category_candidates: [
      "Health, Fitness & Dieting > Nutrition",
      "Health, Fitness & Dieting > Diets & Weight Loss > Mediterranean",
      "Cookbooks, Food & Wine > Special Diet > Heart Healthy",
    ],
    review_loop_plan: [
      "Bygg early reader-liste (20-50 personer)",
      "Send frivillig request om ærlig review uten incentiver",
      "Følg opp etter 7-10 dager",
    ],
    ad_test_plan: "Start med lavt budsjett etter metadata/cover/review-baseline er klar.",
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
  if (!items?.length) {
    return {
      processed: 0,
      moved_to_review: 0,
      suggestions_created: 0,
      created_draft_ids: [] as string[],
      items: [],
    };
  }

  const results: Array<{ id: string; status: string; error?: string }> = [];
  let movedToReview = 0;
  let suggestionsCreated = 0;

  for (const item of items as WorkItem[]) {
    try {
      await supabase
        .from("work_items")
        .update({ status: "IN_PROGRESS", updated_at: new Date().toISOString() })
        .eq("id", item.id);

      const suggestion = buildPublishingDraft(item);
      suggestionsCreated += 1;

      const metadata = typeof item.metadata === "object" && item.metadata ? item.metadata : {};
      const autopilotMeta = {
        ...(metadata as Record<string, unknown>),
        autopilot: {
          processor: "publishing_autopilot_v1",
          processed_at: new Date().toISOString(),
          channel: "amazon_kdp",
          suggestion,
        },
      };

      const { error: updateError } = await supabase
        .from("work_items")
        .update({
          status: "REVIEW",
          next_action: "Se AI-forslag i oppgavens metadata.autopilot.suggestion og bruk det i KDP/Amazon.",
          metadata: autopilotMeta,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (updateError) throw updateError;
      movedToReview += 1;
      results.push({ id: item.id, status: "review" });
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
    suggestions_created: suggestionsCreated,
    created_draft_ids: [] as string[],
    items: results,
  };
}
