import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";
import { findAccessProfile } from "@/lib/access-control-server";
import {
  CONTINUOUS_IMPROVEMENT_SETTINGS_KEY,
  IMPROVEMENT_ACTION_TYPES,
  IMPROVEMENT_STATUSES,
  ROOT_CAUSE_CATEGORIES,
  buildContinuousImprovementRegister,
  canWriteContinuousImprovement,
  candidateById,
  compactContinuousImprovementEvents,
  createImprovementSnapshot,
  improvementById,
  makeImprovementEvent,
  parseContinuousImprovementSettings,
  type ContinuousImprovementSettings,
  type ImprovementActionType,
  type ImprovementEvent,
  type ImprovementStatus,
  type RootCauseCategory,
} from "@/lib/revenue/continuous-improvement";
import {
  WEEKLY_MANAGEMENT_SETTINGS_KEY,
  parseWeeklyManagementSettings,
} from "@/lib/revenue/weekly-management-review";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_SET = new Set<ImprovementStatus>(IMPROVEMENT_STATUSES);
const ROOT_CAUSE_SET = new Set<RootCauseCategory>(ROOT_CAUSE_CATEGORIES);
const ACTION_TYPE_SET = new Set<ImprovementActionType>(IMPROVEMENT_ACTION_TYPES);
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
  const normalizedEmail = session.email.toLowerCase();
  if (session.role === "OWNER") return { email: normalizedEmail, role: session.role };
  const access = await findAccessProfile(normalizedEmail);
  if (access.error || !access.profile?.active || access.profile.role !== session.role) return null;
  return { email: normalizedEmail, role: session.role };
}

async function loadSettings(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const [improvementResult, weeklyResult] = await Promise.all([
    supabase.from("brand_settings").select("settings,updated_at").eq("brand_id", CONTINUOUS_IMPROVEMENT_SETTINGS_KEY).maybeSingle(),
    supabase.from("brand_settings").select("settings,updated_at").eq("brand_id", WEEKLY_MANAGEMENT_SETTINGS_KEY).maybeSingle(),
  ]);
  return {
    improvement: parseContinuousImprovementSettings(improvementResult.data?.settings, improvementResult.data?.updated_at),
    weekly: parseWeeklyManagementSettings(weeklyResult.data?.settings, weeklyResult.data?.updated_at),
    improvementError: improvementResult.error?.message || null,
    weeklyError: weeklyResult.error?.message || null,
  };
}

async function saveSettings(supabase: NonNullable<ReturnType<typeof getSupabase>>, settings: ContinuousImprovementSettings) {
  const updatedAt = new Date().toISOString();
  const payload = { version: 1 as const, events: compactContinuousImprovementEvents(settings.events), updatedAt };
  const result = await supabase.from("brand_settings").upsert({
    brand_id: CONTINUOUS_IMPROVEMENT_SETTINGS_KEY,
    settings: payload,
    updated_at: updatedAt,
  }, { onConflict: "brand_id" });
  return result.error?.message || null;
}

function canManage(role: string, improvementRole: string) {
  return role === "OWNER" || role === improvementRole;
}

function emptyEvent(params: {
  type: ImprovementEvent["type"];
  session: NonNullable<Awaited<ReturnType<typeof sessionFor>>>;
  improvementId: string;
}): Omit<ImprovementEvent, "id" | "at"> {
  return {
    type: params.type,
    actorEmail: params.session.email,
    actorRole: params.session.role,
    improvementId: params.improvementId,
    snapshot: null,
    previousStatus: null,
    status: null,
    rootCauseCategory: null,
    rootCauseStatement: null,
    actionType: null,
    actionPlan: null,
    dueAt: null,
    ownerEmail: null,
    successMetric: null,
    targetValue: null,
    note: null,
  };
}

export async function GET(request: NextRequest) {
  const session = await sessionFor(request);
  if (!session) return NextResponse.json({ error: "Unauthorized", register: null }, { status: 401 });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", register: null }, { status: 500 });
  const loaded = await loadSettings(supabase);
  if (loaded.improvementError) return NextResponse.json({ error: loaded.improvementError, register: null }, { status: 500 });
  const register = buildContinuousImprovementRegister(loaded.improvement, loaded.weekly, session.role);
  return NextResponse.json({
    register,
    weeklyWarning: loaded.weeklyError,
    user: { email: session.email, role: session.role },
    canWrite: canWriteContinuousImprovement(session.role),
    storage: { table: "brand_settings", key: CONTINUOUS_IMPROVEMENT_SETTINGS_KEY },
  });
}

export async function POST(request: NextRequest) {
  const session = await sessionFor(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canWriteContinuousImprovement(session.role)) return NextResponse.json({ error: "Read-only users cannot change the improvement register" }, { status: 403 });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 50).toUpperCase();
  const loaded = await loadSettings(supabase);
  if (loaded.improvementError) return NextResponse.json({ error: loaded.improvementError }, { status: 500 });
  if (loaded.weeklyError) return NextResponse.json({ error: `Weekly Management Review-data kunne ikke hentes: ${loaded.weeklyError}` }, { status: 503 });
  const register = buildContinuousImprovementRegister(loaded.improvement, loaded.weekly, session.role);
  let event: ImprovementEvent | null = null;

  if (action === "CREATE_IMPROVEMENT") {
    const candidateId = clean(body.candidateId, 500);
    if (!candidateId) return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
    const candidate = candidateById(register, candidateId);
    if (!candidate) return NextResponse.json({ error: "Candidate not found or not visible for this role" }, { status: 404 });
    if (candidate.existingImprovementId) return NextResponse.json({ error: "Candidate is already tracked", improvementId: candidate.existingImprovementId }, { status: 409 });
    if (!canManage(session.role, candidate.role)) return NextResponse.json({ error: "This role cannot create the selected improvement" }, { status: 403 });
    const snapshot = createImprovementSnapshot(candidate, session.email);
    event = makeImprovementEvent({
      ...emptyEvent({ type: "IMPROVEMENT_CREATED", session, improvementId: snapshot.id }),
      snapshot,
    });
  } else {
    const improvementId = clean(body.improvementId, 500);
    if (!ID_PATTERN.test(improvementId)) return NextResponse.json({ error: "Valid improvementId is required" }, { status: 400 });
    const improvement = improvementById(register, improvementId);
    if (!improvement) return NextResponse.json({ error: "Improvement not found or not visible for this role" }, { status: 404 });
    if (!canManage(session.role, improvement.role)) return NextResponse.json({ error: "This role cannot change the selected improvement" }, { status: 403 });

    if (action === "UPDATE_IMPROVEMENT") {
      if (improvement.closed) return NextResponse.json({ error: "Reopen the improvement before changing it" }, { status: 409 });
      const status = clean(body.status, 50).toUpperCase() as ImprovementStatus;
      const rootCauseCategory = clean(body.rootCauseCategory, 50).toUpperCase() as RootCauseCategory;
      const actionType = clean(body.actionType, 50).toUpperCase() as ImprovementActionType;
      if (!STATUS_SET.has(status) || !ROOT_CAUSE_SET.has(rootCauseCategory) || !ACTION_TYPE_SET.has(actionType)) {
        return NextResponse.json({ error: "Valid status, rootCauseCategory and actionType are required" }, { status: 400 });
      }
      const rootCauseStatement = clean(body.rootCauseStatement, 1501);
      const actionPlan = clean(body.actionPlan, 2001);
      const successMetric = clean(body.successMetric, 501);
      const targetValue = clean(body.targetValue, 301);
      const note = clean(body.note, 1001);
      if (rootCauseStatement.length > 1500 || actionPlan.length > 2000 || successMetric.length > 500 || targetValue.length > 300 || note.length > 1000) {
        return NextResponse.json({ error: "One or more fields exceed the allowed length" }, { status: 400 });
      }
      const dueAt = body.dueAt ? dateOnly(body.dueAt) : null;
      if (body.dueAt && !dueAt) return NextResponse.json({ error: "Frist må være YYYY-MM-DD." }, { status: 400 });
      const ownerEmail = body.ownerEmail ? email(body.ownerEmail) : "";
      if (body.ownerEmail && !ownerEmail) return NextResponse.json({ error: "Ansvarlig e-post er ugyldig." }, { status: 400 });
      const requiresCauseAndAction = ["ACTION_PLANNED", "IN_PROGRESS", "VERIFYING", "EFFECTIVE", "INEFFECTIVE"].includes(status);
      if (requiresCauseAndAction && (rootCauseCategory === "UNKNOWN" || !rootCauseStatement || actionType === "UNSET" || !actionPlan)) {
        return NextResponse.json({ error: "Denne statusen krever dokumentert rotårsak og korrigerende tiltak." }, { status: 400 });
      }
      if (["ACTION_PLANNED", "IN_PROGRESS", "VERIFYING"].includes(status) && (!dueAt || !ownerEmail)) {
        return NextResponse.json({ error: "Planlagte og aktive tiltak krever journalansvarlig og frist." }, { status: 400 });
      }
      if (["VERIFYING", "EFFECTIVE", "INEFFECTIVE"].includes(status) && !successMetric) {
        return NextResponse.json({ error: "Verifisering og effektkonklusjon krever et definert suksessmål." }, { status: 400 });
      }
      if (status === "EFFECTIVE" && !["IMPROVING", "RESOLVED"].includes(improvement.effect.trend) && !note) {
        return NextResponse.json({ error: "Målt uketrend støtter ikke effekt ennå. Legg inn en forklaring på annet dokumentert bevis." }, { status: 409 });
      }
      if (status === "INEFFECTIVE" && !note) return NextResponse.json({ error: "Ineffektivt tiltak krever en kort forklaring." }, { status: 400 });
      if (
        improvement.status === status && improvement.rootCauseCategory === rootCauseCategory && improvement.rootCauseStatement === (rootCauseStatement || null) &&
        improvement.actionType === actionType && improvement.actionPlan === (actionPlan || null) && improvement.dueAt === dueAt &&
        improvement.ownerEmail === (ownerEmail || null) && improvement.successMetric === (successMetric || null) && improvement.targetValue === (targetValue || null)
      ) return NextResponse.json({ ok: true, unchanged: true, improvementId }, { status: 200 });
      event = makeImprovementEvent({
        ...emptyEvent({ type: "IMPROVEMENT_UPDATED", session, improvementId }),
        previousStatus: improvement.status,
        status,
        rootCauseCategory,
        rootCauseStatement: rootCauseStatement || null,
        actionType,
        actionPlan: actionPlan || null,
        dueAt,
        ownerEmail: ownerEmail || null,
        successMetric: successMetric || null,
        targetValue: targetValue || null,
        note: note || null,
      });
    } else if (action === "ADD_IMPROVEMENT_NOTE") {
      const note = clean(body.note, 1001);
      if (!note) return NextResponse.json({ error: "Merknad er påkrevd." }, { status: 400 });
      if (note.length > 1000) return NextResponse.json({ error: "Merknaden kan maksimalt være 1000 tegn." }, { status: 400 });
      event = makeImprovementEvent({ ...emptyEvent({ type: "IMPROVEMENT_NOTE_ADDED", session, improvementId }), note });
    } else if (action === "CLOSE_IMPROVEMENT") {
      if (improvement.closed) return NextResponse.json({ ok: true, unchanged: true, improvementId });
      if (!["EFFECTIVE", "INEFFECTIVE", "ACCEPTED_RISK"].includes(improvement.status)) {
        return NextResponse.json({ error: "Tiltaket kan bare lukkes etter effektkonklusjon eller eksplisitt akseptert risiko." }, { status: 409 });
      }
      const note = clean(body.note, 1001);
      if (note.length > 1000) return NextResponse.json({ error: "Merknaden kan maksimalt være 1000 tegn." }, { status: 400 });
      event = makeImprovementEvent({ ...emptyEvent({ type: "IMPROVEMENT_CLOSED", session, improvementId }), previousStatus: improvement.status, status: improvement.status, note: note || null });
    } else if (action === "REOPEN_IMPROVEMENT") {
      if (!improvement.closed) return NextResponse.json({ ok: true, unchanged: true, improvementId });
      const note = clean(body.note, 1001);
      if (note.length > 1000) return NextResponse.json({ error: "Merknaden kan maksimalt være 1000 tegn." }, { status: 400 });
      event = makeImprovementEvent({ ...emptyEvent({ type: "IMPROVEMENT_REOPENED", session, improvementId }), previousStatus: improvement.status, status: improvement.status, note: note || null });
    } else {
      return NextResponse.json({ error: "Invalid continuous improvement action" }, { status: 400 });
    }
  }

  if (!event) return NextResponse.json({ error: "No improvement event was created" }, { status: 500 });
  const nextSettings: ContinuousImprovementSettings = { version: 1, events: [event, ...loaded.improvement.events], updatedAt: event.at };
  const saveError = await saveSettings(supabase, nextSettings);
  if (saveError) return NextResponse.json({ error: saveError }, { status: 500 });
  return NextResponse.json({ ok: true, event }, { status: 201 });
}
