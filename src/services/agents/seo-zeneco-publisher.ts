import type { SupabaseClient } from "@supabase/supabase-js";
import type { GSCBrandSnapshot } from "./seo-search-console";
import {
  selectZenEcoMetadataCandidate, zenEcoReadinessValid,
} from "./seo-zeneco-metadata";

const BASE = "https://www.zenecohomes.com";
const ACTION = "seo_zeneco_metadata_attempt";
const COOLDOWN_MS = 28 * 86400000;
const VERIFY_TIMEOUT_MS = 72 * 3600000;

type Attempt = {
  id: string; created_at: string; details: {
    change_id?: string; page?: string; title?: string; description?: string;
    query?: string; metadata_revision?: number; applied_at?: string;
    baseline_period_start?: string; baseline_period_end?: string;
    baseline_impressions?: number; baseline_clicks?: number; baseline_position?: number;
  };
};
export type ZenEcoPublisherResult = {
  status: "monitor" | "blocked" | "pending" | "verified" | "rollback";
  reason: string; page: string | null; published: number;
};

async function checkReadiness(expectedDbHost: string): Promise<boolean> {
  try {
    const response = await fetch(BASE + "/api/seo-pilot/ready", {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(7000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;
    const data: unknown = await response.json();
    return zenEcoReadinessValid(data, expectedDbHost);
  } catch { return false; }
}

/**
 * Confirm actual public Next.js head content, not an incidental mention in
 * page body, scripts, OpenGraph, or HTML served for a different route.
 */
export function verifyZenEcoPublishedMetadataHtml(
  html: string, path: string, title: string, description: string,
): boolean {
  const end = html.toLowerCase().indexOf("</head>");
  if (end < 0) return false;
  const head = html.slice(0, end);
  const foundTitle = head.match(/<title>([^<]*)<\/title>/i)?.[1] || "";
  const descriptionTag = head.match(/<meta\s+[^>]*name=["']description["'][^>]*>/i)?.[0] || "";
  const foundDescription = descriptionTag.match(/\bcontent=["']([^"']*)["']/i)?.[1] || "";
  const canonicalTag = head.match(/<link\s+[^>]*rel=["']canonical["'][^>]*>/i)?.[0] || "";
  const canonical = canonicalTag.match(/\bhref=["']([^"']*)["']/i)?.[1] || "";
  return foundTitle === title && foundDescription === description && canonical === BASE + path;
}

async function visiblePublicMetadata(path: string, title: string, description: string): Promise<boolean> {
  // The page path comes from the literal owner-approved page allowlist, never
  // from a Google query or webhook input.
  try {
    const response = await fetch(BASE + path, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(9000),
      headers: { Accept: "text/html" },
    });
    if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return false;
    const html = (await response.text()).slice(0, 150000);
    return verifyZenEcoPublishedMetadataHtml(html, path, title, description);
  } catch { return false; }
}

async function applyRevision(supabase: SupabaseClient, data: {
  path: string; title: string | null; description: string | null;
  expectedRevision: number; changeId: string; action: "apply" | "rollback";
}) {
  const { data: result, error } = await supabase.rpc("apply_zeneco_seo_override", {
    p_path: data.path, p_title: data.title, p_description: data.description,
    p_expected_revision: data.expectedRevision, p_change_id: data.changeId,
    p_action: data.action,
  });
  if (error) throw new Error("SEO publisher revision rejected: " + error.code);
  const row = Array.isArray(result) ? result[0] : null;
  if (!row || !Number.isInteger(row.revision) || row.active !== (data.action === "apply")) {
    throw new Error("SEO publisher revision response was invalid");
  }
  return row as { page_path: string; revision: number; active: boolean; changed: boolean };
}

export async function runZenEcoMetadataPublisher(
  supabase: SupabaseClient, snapshot: GSCBrandSnapshot | null, expectedSupabaseUrl: string,
  now = new Date(),
): Promise<ZenEcoPublisherResult> {
  const { data: pending, error: pendingError } = await supabase.from("automation_logs")
    .select("id,created_at,details").eq("action", ACTION).eq("status", "partial")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (pendingError) throw new Error("SEO publication audit lookup failed: " + pendingError.code);

  const expectedDbHost = new URL(expectedSupabaseUrl).host;
  if (pending) {
    const attempt = pending as Attempt;
    const p = attempt.details || {};
    if (!p.page || !p.title || !p.description || !p.change_id ||
        !Number.isInteger(p.metadata_revision) || !/^\/[a-z0-9-]+$/.test(p.page)) {
      // Do not issue a blind rollback without a trusted, complete revision.
      return { status: "blocked", reason: "Ufullstendig endringslogg. Må kontrolleres manuelt.",
        page: null, published: 0 };
    }
    if (await checkReadiness(expectedDbHost) &&
        await visiblePublicMetadata(p.page, p.title, p.description)) {
      const { error: finalizeError } = await supabase.from("automation_logs")
        .update({ status: "success", details: { ...p, site_verified: true,
          verified_at: now.toISOString() } }).eq("id", attempt.id).eq("status", "partial");
      if (finalizeError) throw new Error("SEO publication verification could not be stored: " + finalizeError.code);

      const { data: already, error: seenError } = await supabase.from("automation_logs")
        .select("id").eq("action", "seo_autopilot_change")
        .contains("details", { change_id: p.change_id }).limit(1).maybeSingle();
      if (seenError) throw new Error("SEO audit deduplication failed: " + seenError.code);
      if (!already) {
        const { error: auditError } = await supabase.from("automation_logs").insert({
          action: "seo_autopilot_change", agent_name: "Sam SEO Expert", status: "success",
          details: {
            change_id: p.change_id, brand_id: "zeneco", page: p.page, query: p.query,
            metadata_revision: p.metadata_revision, applied_at: p.applied_at,
            baseline_period_start: p.baseline_period_start,
            baseline_period_end: p.baseline_period_end,
            baseline_impressions: p.baseline_impressions,
            baseline_clicks: p.baseline_clicks,
            baseline_position: p.baseline_position,
            site_verified: true, publisher: "zeneco_metadata_v1",
          },
        });
        if (auditError) throw new Error("Verified SEO change audit failed: " + auditError.code);
      }
      return { status: "verified", reason: "Endringen er bekreftet synlig på nettstedet og loggført.",
        page: p.page, published: 1 };
    }
    const age = now.getTime() - Date.parse(attempt.created_at);
    if (!Number.isFinite(age) || age < VERIFY_TIMEOUT_MS) {
      return { status: "pending", reason: "Venter på at nettsiden skal vise den lagrede metadataendringen.",
        page: p.page, published: 0 };
    }
    // Cannot confirm the live page after 72 hours. Atomically roll back the
    // exact revision; the site will fall back to its compiled static metadata.
    const rollback = await applyRevision(supabase, {
      path: p.page, title: null, description: null, expectedRevision: p.metadata_revision!,
      changeId: p.change_id + "_rollback", action: "rollback",
    });
    const { error: closeError } = await supabase.from("automation_logs")
      .update({ status: "error", details: { ...p, site_verified: false,
        rolled_back: true, rollback_revision: rollback.revision } })
      .eq("id", attempt.id).eq("status", "partial");
    if (closeError) throw new Error("SEO rollback audit failed: " + closeError.code);
    return { status: "rollback", reason: "Nettstedet viste ikke endringen; den lagrede revisjonen er deaktivert.",
      page: p.page, published: 0 };
  }

  const candidate = selectZenEcoMetadataCandidate(snapshot, now);
  // Capability is checked even when there is no Google candidate. The owner
  // can see whether the live site truly reads the SAME published table before
  // Sam is allowed to write anything.
  const ready = await checkReadiness(expectedDbHost);
  if (!ready) return {
    status: "blocked", reason: "Nettstedets metadata-mottaker eller lesetilgang til riktig database er ikke verifisert. Ingen endring utført.",
    page: candidate?.path || null, published: 0,
  };
  if (!candidate) return { status: "monitor", reason: "Metadata-mottakeren er verifisert, men ingen side oppfyller Google-kravene for automatisk endring.",
    page: null, published: 0 };

  const { data: priorRows, error: priorError } = await supabase.from("seo_page_overrides")
    .select("page_path,revision,active").eq("brand_id", "zeneco");
  if (priorError) throw new Error("SEO override state lookup failed: " + priorError.code);
  // Exactly one lifetime experiment per page until a deliberate new plan.
  if ((priorRows || []).some(row => row.page_path === candidate.path)) return {
    status: "monitor", reason: "Siden har allerede en tidligere endring eller tilbakeføring; ingen automatisk ny versjon.",
    page: candidate.path, published: 0,
  };
  const { data: recent, error: recentError } = await supabase.from("automation_logs")
    .select("id").eq("action", ACTION)
    .gte("created_at", new Date(now.getTime() - COOLDOWN_MS).toISOString())
    .limit(1).maybeSingle();
  if (recentError) throw new Error("SEO change cooldown lookup failed: " + recentError.code);
  if (recent) return { status: "monitor", reason: "Publiseringsgrense: maksimalt ett eksperiment per 28 dager.",
    page: candidate.path, published: 0 };

  const changeId = "zeneco_" + candidate.path.slice(1).replace(/-/g, "_") + "_" +
    candidate.baseline.end.replace(/-/g, "");
  const row = await applyRevision(supabase, {
    path: candidate.path, title: candidate.title, description: candidate.description,
    expectedRevision: 0, changeId, action: "apply",
  });
  if (!row.changed) {
    // Another cron invocation already claimed this immutable change ID.
    // Never create a second partial audit or roll back its legitimate revision.
    return { status: "pending", reason: "Dette metadataforsøket er allerede registrert og avventer kontroll.",
      page: candidate.path, published: 0 };
  }
  const { error: attemptError } = await supabase.from("automation_logs").insert({
    action: ACTION, agent_name: "Sam SEO Expert", status: "partial",
    details: {
      change_id: changeId, brand_id: "zeneco", page: candidate.path,
      title: candidate.title, description: candidate.description, query: candidate.query,
      metadata_revision: row.revision, applied_at: now.toISOString(),
      baseline_period_start: candidate.baseline.start,
      baseline_period_end: candidate.baseline.end,
      baseline_impressions: candidate.baseline.impressions,
      baseline_clicks: candidate.baseline.clicks, baseline_position: candidate.baseline.position,
      site_verified: false, publisher: "zeneco_metadata_v1",
    },
  });
  if (attemptError) {
    await applyRevision(supabase, { path: candidate.path, title: null, description: null,
      expectedRevision: row.revision, changeId: changeId + "_audit_rollback", action: "rollback" });
    throw new Error("SEO audit failed; revision was rolled back: " + attemptError.code);
  }
  return { status: "pending", reason: "Avgrenset metadata er lagret. Venter på kontroll av faktisk nettsidevisning.",
    page: candidate.path, published: 0 };
}
