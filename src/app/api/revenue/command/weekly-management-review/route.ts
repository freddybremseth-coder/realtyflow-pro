import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";
import { parseOperatingReviewSettings, OPERATING_REVIEW_SETTINGS_KEY, type OperatingReviewSettings } from "@/lib/revenue/operating-review";
import {
  WEEKLY_ISSUE_STATUSES,
  WEEKLY_MANAGEMENT_SETTINGS_KEY,
  buildWeeklyManagementJournal,
  canWriteWeeklyManagement,
  compactWeeklyManagementEvents,
  createWeeklyManagementSnapshot,
  makeWeeklyManagementEvent,
  parseWeeklyManagementSettings,
  weeklyReviewById,
  type WeeklyIssueStatus,
  type WeeklyManagementEvent,
  type WeeklyManagementSettings,
} from "@/lib/revenue/weekly-management-review";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_SET = new Set<WeeklyIssueStatus>(WEEKLY_ISSUE_STATUSES);
const ID_PATTERN = /^[a-zA-Z0-9:_@.%-]{1,500}$/;

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

async function sessionFor(request: NextRequest) {
  const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (!session?.email || !session.role) return null;
  return { email: session.email.toLowerCase(), role: session.role };
}

async function loadOperatingSettings(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const result = await supabase.from("brand_settings").select("settings,updated_at").eq("brand_id", OPERATING_REVIEW_SETTINGS_KEY).maybeSingle();
  return {
    settings: parseOperatingReviewSettings(result.data?.settings, result.data?.updated_at),
    error: result.error?.message || null,
  };
}

async function loadWeeklySettings(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const result = await supabase.from("brand_settings").select("settings,updated_at").eq("brand_id", WEEKLY_MANAGEMENT_SETTINGS_KEY).maybeSingle();
  return {
    settings: parseWeeklyManagementSettings(result.data?.settings, result.data?.updated_at),
    error: result.error?.message || null,
  };
}

async function saveWeeklySettings(supabase: NonNullable<ReturnType<typeof getSupabase>>, settings: WeeklyManagementSettings) {
  const updatedAt = new Date().toISOString();
  const payload = { version: 1 as const, events: compactWeeklyManagementEvents(settings.events), updatedAt };
  const result = await supabase.from("brand_settings").upsert({
    brand_id: WEEKLY_MANAGEMENT_SETTINGS_KEY,
    settings: payload,
    updated_at: updatedAt,
  }, { onConflict: "brand_id" });
  return result.error?.message || null;
}

function canManageReview(role: string, reviewRole: string) {
  return role === "OWNER" || role === reviewRole;
}

function baseEvent(params: {
  type: WeeklyManagementEvent["type"];
  session: NonNullable<Awaited<ReturnType<typeof sessionFor>>>;
  reviewId: string;
  weekStart: string;
}): Omit<WeeklyManagementEvent, "id" | "at"> {
  return {
    type: params.type,
    actorEmail: params.session.email,
    actorRole: params.session.role,
    reviewId: params.reviewId,
    weekStart: params.weekStart,
    snapshot: null,
    issueId: null,
    issueFingerprint: null,
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

  const [operating, weekly] = await Promise.all([loadOperatingSettings(supabase), loadWeeklySettings(supabase)]);
  if (weekly.error) return NextResponse.json({ error: weekly.error, journal: null }, { status: 500 });
  const currentSnapshot = createWeeklyManagementSnapshot(operating.settings, session.role, session.email);
  const journal = buildWeeklyManagementJournal(weekly.settings, session.role);
  return NextResponse.json({
    journal,
    currentSnapshot,
    operatingReviewWarning: operating.error,
    user: { email: session.email, role: session.role },
    canWrite: canWriteWeeklyManagement(session.role),
    storage: { table: "brand_settings", key: WEEKLY_MANAGEMENT_SETTINGS_KEY },
  });
}

export async function POST(request: NextRequest) {
  const session = await sessionFor(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWriteWeeklyManagement(session.role)) return NextResponse.json({ error: "Read-only users cannot change the weekly management review" }, { status: 403 });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 50).toUpperCase();
  const [operating, weekly] = await Promise.all([loadOperatingSettings(supabase), loadWeeklySettings(supabase)]);
  if (weekly.error) return NextResponse.json({ error: weekly.error }, { status: 500 });
  if (operating.error) return NextResponse.json({ error: `Operating Review-data kunne ikke hentes: ${operating.error}` }, { status: 503 });
  const journal = buildWeeklyManagementJournal(weekly.settings, session.role);
  const now = new Date();
  let event: WeeklyManagementEvent | null = null;

  if (action === "CAPTURE_WEEK") {
    if (journal.currentReviewId) return NextResponse.json({ error: "Denne ukens ledelsesgjennomgang finnes allerede. Bruk oppdater analyse.", reviewId: journal.currentReviewId }, { status: 409 });
    const snapshot = createWeeklyManagementSnapshot(operating.settings, session.role, session.email, now);
    event = makeWeeklyManagementEvent({
      ...baseEvent({ type: "WEEK_CAPTURED", session, reviewId: snapshot.id, weekStart: snapshot.weekStart }),
      snapshot,
    });
  } else {
    const reviewId = clean(body.reviewId, 500);
    if (!ID_PATTERN.test(reviewId)) return NextResponse.json({ error: "Valid reviewId is required" }, { status: 400 });
    const review = weeklyReviewById(journal, reviewId);
    if (!review) return NextResponse.json({ error: "Weekly review not found or not visible for this role" }, { status: 404 });
    if (!canManageReview(session.role, review.capturedRole)) return NextResponse.json({ error: "This role cannot change the selected weekly review" }, { status: 403 });

    if (action === "REFRESH_WEEK") {
      if (review.completed) return NextResponse.json({ error: "Gjenåpne ukesgjennomgangen før analysen oppdateres." }, { status: 409 });
      if (review.weekStart !== journal.currentWeekStart) return NextResponse.json({ error: "Bare inneværende uke kan oppdateres." }, { status: 409 });
      if (review.capturedRole !== session.role) return NextResponse.json({ error: "Ukesanalysen kan bare oppdateres av sin aktive rolle." }, { status: 403 });
      const snapshot = createWeeklyManagementSnapshot(operating.settings, session.role, session.email, now, { reviewId: review.id, revision: review.revision + 1 });
      if (snapshot.fingerprint === review.fingerprint) return NextResponse.json({ ok: true, unchanged: true, reviewId: review.id });
      event = makeWeeklyManagementEvent({
        ...baseEvent({ type: "WEEK_REFRESHED", session, reviewId: review.id, weekStart: review.weekStart }),
        snapshot,
      });
    } else if (action === "UPDATE_ISSUE") {
      if (review.completed) return NextResponse.json({ error: "Gjenåpne ukesgjennomgangen før konklusjoner endres." }, { status: 409 });
      const issueId = clean(body.issueId, 500);
      const issueFingerprint = clean(body.issueFingerprint, 64);
      const status = clean(body.status, 50).toUpperCase() as WeeklyIssueStatus;
      if (!ID_PATTERN.test(issueId) || !issueFingerprint || !STATUS_SET.has(status)) return NextResponse.json({ error: "Valid issueId, issueFingerprint and status are required" }, { status: 400 });
      const issue = review.issues.find((item) => item.id === issueId);
      if (!issue) return NextResponse.json({ error: "Issue not found in the current weekly snapshot" }, { status: 404 });
      if (issue.fingerprint !== issueFingerprint) return NextResponse.json({ error: "Issue condition changed. Refresh the weekly analysis before recording a conclusion." }, { status: 409 });
      const note = clean(body.note, 1001);
      if (note.length > 1000) return NextResponse.json({ error: "Merknaden kan maksimalt være 1000 tegn." }, { status: 400 });
      const followupAt = body.followupAt ? dateOnly(body.followupAt) : null;
      if (body.followupAt && !followupAt) return NextResponse.json({ error: "Oppfølgingsdato må være YYYY-MM-DD." }, { status: 400 });
      const responsibleEmail = body.responsibleEmail ? email(body.responsibleEmail) : "";
      if (body.responsibleEmail && !responsibleEmail) return NextResponse.json({ error: "Ansvarlig e-post er ugyldig." }, { status: 400 });
      if (["MONITOR", "CORRECTIVE_ACTION"].includes(status) && !followupAt) return NextResponse.json({ error: "Monitorering eller korrigerende handling må ha oppfølgingsdato." }, { status: 400 });
      if (status === "ESCALATED" && !responsibleEmail && !note) return NextResponse.json({ error: "Eskalering må ha ansvarlig e-post eller forklarende merknad." }, { status: 400 });
      if (issue.status === status && issue.note === (note || null) && issue.followupAt === followupAt && issue.responsibleEmail === (responsibleEmail || null)) {
        return NextResponse.json({ ok: true, unchanged: true, reviewId: review.id, issueId });
      }
      event = makeWeeklyManagementEvent({
        ...baseEvent({ type: "ISSUE_UPDATED", session, reviewId: review.id, weekStart: review.weekStart }),
        issueId,
        issueFingerprint: issue.fingerprint,
        previousStatus: issue.status,
        status,
        note: note || null,
        followupAt,
        responsibleEmail: responsibleEmail || null,
      });
    } else if (action === "ADD_WEEK_NOTE") {
      const note = clean(body.note, 1001);
      if (!note) return NextResponse.json({ error: "Merknad er påkrevd." }, { status: 400 });
      if (note.length > 1000) return NextResponse.json({ error: "Merknaden kan maksimalt være 1000 tegn." }, { status: 400 });
      event = makeWeeklyManagementEvent({
        ...baseEvent({ type: "WEEK_NOTE_ADDED", session, reviewId: review.id, weekStart: review.weekStart }),
        note,
      });
    } else if (action === "COMPLETE_WEEK") {
      if (review.completed) return NextResponse.json({ ok: true, unchanged: true, reviewId: review.id });
      if (review.openIssues > 0) return NextResponse.json({ error: `${review.openIssues} flaskehalser mangler fortsatt registrert konklusjon.` }, { status: 409 });
      const note = clean(body.note, 1001);
      if (note.length > 1000) return NextResponse.json({ error: "Merknaden kan maksimalt være 1000 tegn." }, { status: 400 });
      event = makeWeeklyManagementEvent({
        ...baseEvent({ type: "WEEK_COMPLETED", session, reviewId: review.id, weekStart: review.weekStart }),
        note: note || null,
      });
    } else if (action === "REOPEN_WEEK") {
      if (!review.completed) return NextResponse.json({ ok: true, unchanged: true, reviewId: review.id });
      const note = clean(body.note, 1001);
      if (note.length > 1000) return NextResponse.json({ error: "Merknaden kan maksimalt være 1000 tegn." }, { status: 400 });
      event = makeWeeklyManagementEvent({
        ...baseEvent({ type: "WEEK_REOPENED", session, reviewId: review.id, weekStart: review.weekStart }),
        note: note || null,
      });
    } else {
      return NextResponse.json({ error: "Invalid weekly management review action" }, { status: 400 });
    }
  }

  if (!event) return NextResponse.json({ error: "No weekly management event was created" }, { status: 500 });
  const nextSettings: WeeklyManagementSettings = { version: 1, events: [event, ...weekly.settings.events], updatedAt: event.at };
  const saveError = await saveWeeklySettings(supabase, nextSettings);
  if (saveError) return NextResponse.json({ error: saveError }, { status: 500 });
  return NextResponse.json({ ok: true, event }, { status: 201 });
}
