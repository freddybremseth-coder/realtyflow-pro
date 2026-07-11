import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";
import { GET as getExecutiveBriefing } from "../../executive-briefing/route";
import {
  OPERATING_DECISION_STATUSES,
  OPERATING_REVIEW_SETTINGS_KEY,
  buildOperatingReviewJournal,
  canWriteOperatingReview,
  compactOperatingReviewEvents,
  createOperatingReviewSnapshot,
  makeOperatingReviewEvent,
  parseOperatingReviewSettings,
  reviewById,
  type OperatingDecisionStatus,
  type OperatingReviewEvent,
  type OperatingReviewSettings,
} from "@/lib/revenue/operating-review";
import type { ExecutiveBriefing } from "@/lib/revenue/executive-briefing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_SET = new Set<OperatingDecisionStatus>(OPERATING_DECISION_STATUSES);
const REVIEW_ID_PATTERN = /^[a-zA-Z0-9:_@.%-]{1,500}$/;
const DECISION_ID_PATTERN = /^[a-zA-Z0-9:_@.%-]{1,500}$/;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

function clean(value: unknown, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function email(value: unknown) {
  const normalized = clean(value, 320).toLowerCase();
  return normalized.includes("@") ? normalized : "";
}

function dateOnly(value: unknown) {
  const raw = clean(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : raw;
}

async function loadSettings(supabase: ReturnType<typeof getSupabase>) {
  if (!supabase) return { row: null, settings: parseOperatingReviewSettings(null), error: "Supabase not configured" };
  const result = await supabase
    .from("brand_settings")
    .select("settings,updated_at")
    .eq("brand_id", OPERATING_REVIEW_SETTINGS_KEY)
    .maybeSingle();
  if (result.error) return { row: null, settings: parseOperatingReviewSettings(null), error: result.error.message };
  return {
    row: result.data || null,
    settings: parseOperatingReviewSettings(result.data?.settings, result.data?.updated_at),
    error: null as string | null,
  };
}

async function saveSettings(supabase: NonNullable<ReturnType<typeof getSupabase>>, settings: OperatingReviewSettings) {
  const updatedAt = new Date().toISOString();
  const payload = {
    version: 1 as const,
    events: compactOperatingReviewEvents(settings.events),
    updatedAt,
  };
  const result = await supabase.from("brand_settings").upsert({
    brand_id: OPERATING_REVIEW_SETTINGS_KEY,
    settings: payload,
    updated_at: updatedAt,
  }, { onConflict: "brand_id" });
  return result.error ? result.error.message : null;
}

async function loadCurrentBriefing(request: NextRequest): Promise<{ briefing: ExecutiveBriefing | null; error: string | null }> {
  try {
    const response = await getExecutiveBriefing(request);
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.briefing) return { briefing: null, error: body?.error || "Dagens briefing kunne ikke bygges." };
    return { briefing: body.briefing as ExecutiveBriefing, error: null };
  } catch (error) {
    return { briefing: null, error: error instanceof Error ? error.message : "Dagens briefing kunne ikke bygges." };
  }
}

async function sessionFor(request: NextRequest) {
  const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (!session?.email || !session.role) return null;
  return { email: session.email.toLowerCase(), role: session.role };
}

function canManageReview(role: string, reviewRole: string) {
  return role === "OWNER" || role === reviewRole;
}

function baseEvent(params: {
  type: OperatingReviewEvent["type"];
  session: NonNullable<Awaited<ReturnType<typeof sessionFor>>>;
  reviewId: string;
  reviewDate: string;
}): Omit<OperatingReviewEvent, "id" | "at"> {
  return {
    type: params.type,
    actorEmail: params.session.email,
    actorRole: params.session.role,
    reviewId: params.reviewId,
    reviewDate: params.reviewDate,
    snapshot: null,
    decisionId: null,
    decisionFingerprint: null,
    previousStatus: null,
    status: null,
    note: null,
    followupAt: null,
    responsibleEmail: null,
  };
}

export async function GET(request: NextRequest) {
  const session = await sessionFor(request);
  if (!session) return NextResponse.json({ error: "Unauthorized", journal: null }, { status: 401 });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", journal: null }, { status: 500 });

  const [stored, current] = await Promise.all([
    loadSettings(supabase),
    loadCurrentBriefing(request),
  ]);
  if (stored.error) return NextResponse.json({ error: stored.error, journal: null }, { status: 500 });
  const journal = buildOperatingReviewJournal(stored.settings, session.role);
  return NextResponse.json({
    journal,
    currentBriefing: current.briefing,
    currentBriefingWarning: current.error,
    user: { email: session.email, role: session.role },
    canWrite: canWriteOperatingReview(session.role),
    storage: { table: "brand_settings", key: OPERATING_REVIEW_SETTINGS_KEY },
  });
}

export async function POST(request: NextRequest) {
  const session = await sessionFor(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWriteOperatingReview(session.role)) return NextResponse.json({ error: "Read-only users cannot change the operating review journal" }, { status: 403 });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 50).toUpperCase();
  const stored = await loadSettings(supabase);
  if (stored.error) return NextResponse.json({ error: stored.error }, { status: 500 });
  const journal = buildOperatingReviewJournal(stored.settings, session.role);
  const now = new Date();
  let event: OperatingReviewEvent | null = null;

  if (action === "CAPTURE_REVIEW") {
    if (journal.todayReviewId) return NextResponse.json({ error: "Dagens gjennomgang finnes allerede. Bruk oppdater snapshot.", reviewId: journal.todayReviewId }, { status: 409 });
    const current = await loadCurrentBriefing(request);
    if (!current.briefing) return NextResponse.json({ error: current.error || "Dagens briefing er utilgjengelig." }, { status: 503 });
    if (current.briefing.role !== session.role) return NextResponse.json({ error: "Briefing role does not match the active session" }, { status: 409 });
    const snapshot = createOperatingReviewSnapshot(current.briefing, session.email, now);
    event = makeOperatingReviewEvent({
      ...baseEvent({ type: "REVIEW_CAPTURED", session, reviewId: snapshot.id, reviewDate: snapshot.reviewDate }),
      snapshot,
    });
  } else {
    const reviewId = clean(body.reviewId, 500);
    if (!REVIEW_ID_PATTERN.test(reviewId)) return NextResponse.json({ error: "Valid reviewId is required" }, { status: 400 });
    const review = reviewById(journal, reviewId);
    if (!review) return NextResponse.json({ error: "Review not found or not visible for this role" }, { status: 404 });
    if (!canManageReview(session.role, review.capturedRole)) return NextResponse.json({ error: "This role cannot change the selected review" }, { status: 403 });

    if (action === "REFRESH_REVIEW") {
      if (review.completed) return NextResponse.json({ error: "Reopen the review before refreshing its snapshot" }, { status: 409 });
      if (review.reviewDate !== journal.today) return NextResponse.json({ error: "Only today's review can be refreshed" }, { status: 409 });
      if (review.capturedRole !== session.role) return NextResponse.json({ error: "A review can only be refreshed by its own active role" }, { status: 403 });
      const current = await loadCurrentBriefing(request);
      if (!current.briefing) return NextResponse.json({ error: current.error || "Dagens briefing er utilgjengelig." }, { status: 503 });
      if (current.briefing.role !== review.capturedRole) return NextResponse.json({ error: "Current briefing role does not match the review" }, { status: 409 });
      const snapshot = createOperatingReviewSnapshot(current.briefing, session.email, now, {
        reviewId: review.id,
        revision: review.revision + 1,
      });
      if (snapshot.fingerprint === review.fingerprint) return NextResponse.json({ ok: true, unchanged: true, reviewId: review.id });
      event = makeOperatingReviewEvent({
        ...baseEvent({ type: "REVIEW_REFRESHED", session, reviewId: review.id, reviewDate: review.reviewDate }),
        snapshot,
      });
    } else if (action === "UPDATE_DECISION") {
      if (review.completed) return NextResponse.json({ error: "Reopen the review before changing decisions" }, { status: 409 });
      const decisionId = clean(body.decisionId, 500);
      const requestedFingerprint = clean(body.decisionFingerprint, 64).toLowerCase();
      const status = clean(body.status, 50).toUpperCase() as OperatingDecisionStatus;
      if (!DECISION_ID_PATTERN.test(decisionId) || !requestedFingerprint || !STATUS_SET.has(status)) {
        return NextResponse.json({ error: "Valid decisionId, decisionFingerprint and status are required" }, { status: 400 });
      }
      const decision = review.decisions.find((item) => item.id === decisionId);
      if (!decision) return NextResponse.json({ error: "Decision not found in the current review snapshot" }, { status: 404 });
      if (decision.fingerprint !== requestedFingerprint) return NextResponse.json({ error: "Decision condition changed. Refresh the review before recording a decision." }, { status: 409 });
      const note = clean(body.note, 1001);
      if (note.length > 1000) return NextResponse.json({ error: "Merknaden kan maksimalt være 1000 tegn." }, { status: 400 });
      const followupAt = body.followupAt ? dateOnly(body.followupAt) : null;
      if (body.followupAt && !followupAt) return NextResponse.json({ error: "Oppfølgingsdato må være YYYY-MM-DD." }, { status: 400 });
      const responsibleEmail = body.responsibleEmail ? email(body.responsibleEmail) : "";
      if (body.responsibleEmail && !responsibleEmail) return NextResponse.json({ error: "Ansvarlig e-post er ugyldig." }, { status: 400 });
      if (["ACTION_PLANNED", "DEFERRED"].includes(status) && !followupAt) {
        return NextResponse.json({ error: "Planlagt eller utsatt handling må ha en oppfølgingsdato." }, { status: 400 });
      }
      if (status === "ESCALATED" && !responsibleEmail && !note) {
        return NextResponse.json({ error: "Eskalering må ha ansvarlig e-post eller en forklarende merknad." }, { status: 400 });
      }
      if (
        decision.status === status &&
        decision.note === (note || null) &&
        decision.followupAt === followupAt &&
        decision.responsibleEmail === (responsibleEmail || null)
      ) return NextResponse.json({ ok: true, unchanged: true, reviewId: review.id, decisionId });
      event = makeOperatingReviewEvent({
        ...baseEvent({ type: "DECISION_UPDATED", session, reviewId: review.id, reviewDate: review.reviewDate }),
        decisionId,
        decisionFingerprint: decision.fingerprint,
        previousStatus: decision.status,
        status,
        note: note || null,
        followupAt,
        responsibleEmail: responsibleEmail || null,
      });
    } else if (action === "ADD_REVIEW_NOTE") {
      const note = clean(body.note, 1001);
      if (!note) return NextResponse.json({ error: "Merknad er påkrevd." }, { status: 400 });
      if (note.length > 1000) return NextResponse.json({ error: "Merknaden kan maksimalt være 1000 tegn." }, { status: 400 });
      event = makeOperatingReviewEvent({
        ...baseEvent({ type: "REVIEW_NOTE_ADDED", session, reviewId: review.id, reviewDate: review.reviewDate }),
        note,
      });
    } else if (action === "COMPLETE_REVIEW") {
      if (review.completed) return NextResponse.json({ ok: true, unchanged: true, reviewId: review.id });
      if (review.undecided > 0) return NextResponse.json({ error: `${review.undecided} beslutninger mangler fortsatt registrert konklusjon.` }, { status: 409 });
      const note = clean(body.note, 1001);
      if (note.length > 1000) return NextResponse.json({ error: "Merknaden kan maksimalt være 1000 tegn." }, { status: 400 });
      event = makeOperatingReviewEvent({
        ...baseEvent({ type: "REVIEW_COMPLETED", session, reviewId: review.id, reviewDate: review.reviewDate }),
        note: note || null,
      });
    } else if (action === "REOPEN_REVIEW") {
      if (!review.completed) return NextResponse.json({ ok: true, unchanged: true, reviewId: review.id });
      const note = clean(body.note, 1001);
      if (note.length > 1000) return NextResponse.json({ error: "Merknaden kan maksimalt være 1000 tegn." }, { status: 400 });
      event = makeOperatingReviewEvent({
        ...baseEvent({ type: "REVIEW_REOPENED", session, reviewId: review.id, reviewDate: review.reviewDate }),
        note: note || null,
      });
    } else {
      return NextResponse.json({ error: "Invalid operating review action" }, { status: 400 });
    }
  }

  if (!event) return NextResponse.json({ error: "No journal event was created" }, { status: 500 });
  const nextSettings: OperatingReviewSettings = {
    version: 1,
    events: [event, ...stored.settings.events],
    updatedAt: event.at,
  };
  const saveError = await saveSettings(supabase, nextSettings);
  if (saveError) return NextResponse.json({ error: saveError }, { status: 500 });
  return NextResponse.json({ ok: true, event }, { status: 201 });
}
