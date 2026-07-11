import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { requireAdminApi } from "@/lib/api-admin";

function getOAuth2Client() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function getCalendarClient() {
  const auth = getOAuth2Client();
  return auth ? google.calendar({ version: "v3", auth }) : null;
}

function text(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function validDateTime(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : raw;
}

function validDate(value: unknown) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : raw;
}

function nextDate(date: string) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function allDayRange(startValue: unknown, endValue: unknown) {
  const start = validDate(startValue);
  if (!start) return null;
  const requestedEnd = validDate(endValue) || start;
  return { start, end: requestedEnd > start ? requestedEnd : nextDate(start) };
}

function eventRange(startValue: unknown, endValue: unknown) {
  const start = validDateTime(startValue);
  const end = validDateTime(endValue);
  if (!start) return null;
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date(startDate.getTime() + 30 * 60_000);
  if (endDate <= startDate || endDate.getTime() - startDate.getTime() > 24 * 60 * 60_000) return null;
  return { start, end: endDate.toISOString() };
}

function calendarError(error: unknown, operation: string) {
  console.error(`[Calendar API] ${operation} error:`, error instanceof Error ? error.message : "unknown");
  return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const adminError = await requireAdminApi(req, { configured: false, calendars: [], events: [] });
  if (adminError) return adminError;

  try {
    const cal = getCalendarClient();
    if (!cal) return NextResponse.json({ configured: false, calendars: [], events: [] });
    const { searchParams } = new URL(req.url);
    if (searchParams.get("action") === "list_calendars") {
      const res = await cal.calendarList.list();
      return NextResponse.json({
        configured: true,
        calendars: (res.data.items || []).map((item) => ({
          id: item.id,
          summary: item.summary,
          description: item.description,
          backgroundColor: item.backgroundColor,
          foregroundColor: item.foregroundColor,
          primary: item.primary || false,
          accessRole: item.accessRole,
        })),
      });
    }

    const start = validDateTime(searchParams.get("start"));
    const end = validDateTime(searchParams.get("end"));
    const requestedCalendarId = text(searchParams.get("calendarId"), 512);
    if (!start || !end) return NextResponse.json({ error: "Valid start and end parameters are required" }, { status: 400 });
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate <= startDate || endDate.getTime() - startDate.getTime() > 370 * 86_400_000) {
      return NextResponse.json({ error: "Calendar range must be positive and no longer than 370 days" }, { status: 400 });
    }

    const calendarIds: string[] = [];
    if (requestedCalendarId) calendarIds.push(requestedCalendarId);
    else {
      const list = await cal.calendarList.list();
      for (const item of list.data.items || []) {
        if (item.id && item.accessRole !== "freeBusyReader") calendarIds.push(item.id);
      }
    }

    const events: Array<Record<string, unknown>> = [];
    for (const calendarId of calendarIds.slice(0, 30)) {
      try {
        const res = await cal.events.list({
          calendarId,
          timeMin: start,
          timeMax: end,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 250,
        });
        for (const event of res.data.items || []) {
          events.push({
            id: event.id,
            calendarId,
            summary: event.summary || "(Uten tittel)",
            description: event.description || "",
            location: event.location || "",
            start: event.start?.dateTime || event.start?.date || "",
            end: event.end?.dateTime || event.end?.date || "",
            allDay: !event.start?.dateTime,
            status: event.status,
            htmlLink: event.htmlLink,
            colorId: event.colorId,
            creator: event.creator?.email || "",
            attendees: (event.attendees || []).map((attendee) => ({
              email: attendee.email,
              displayName: attendee.displayName,
              responseStatus: attendee.responseStatus,
            })),
          });
        }
      } catch (error) {
        console.error(`[Calendar] Could not read calendar ${calendarId}:`, error instanceof Error ? error.message : "unknown");
      }
    }

    events.sort((a, b) => new Date(String(a.start || "")).getTime() - new Date(String(b.start || "")).getTime());
    return NextResponse.json({ configured: true, events });
  } catch (error) {
    return calendarError(error, "GET");
  }
}

export async function POST(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;

  try {
    const cal = getCalendarClient();
    if (!cal) return NextResponse.json({ error: "Google Calendar not configured" }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const calendarId = text(body.calendarId || "primary", 512) || "primary";
    const summary = text(body.summary, 200);
    const description = text(body.description, 4000);
    const location = text(body.location, 500);
    const allDay = Boolean(body.allDay);
    if (!summary) return NextResponse.json({ error: "summary is required" }, { status: 400 });

    const requestBody: Record<string, unknown> = { summary, description, location };
    if (allDay) {
      const range = allDayRange(body.start, body.end);
      if (!range) return NextResponse.json({ error: "Valid all-day start is required" }, { status: 400 });
      requestBody.start = { date: range.start };
      requestBody.end = { date: range.end };
    } else {
      const range = eventRange(body.start, body.end);
      if (!range) return NextResponse.json({ error: "Valid start and end are required; duration must be under 24 hours" }, { status: 400 });
      requestBody.start = { dateTime: range.start, timeZone: "Europe/Madrid" };
      requestBody.end = { dateTime: range.end, timeZone: "Europe/Madrid" };
    }

    const res = await cal.events.insert({
      calendarId,
      requestBody: requestBody as Parameters<typeof cal.events.insert>[0] extends { requestBody?: infer R } ? R : never,
    });
    return NextResponse.json({
      id: res.data.id,
      summary: res.data.summary,
      start: res.data.start?.dateTime || res.data.start?.date,
      end: res.data.end?.dateTime || res.data.end?.date,
      htmlLink: res.data.htmlLink,
    }, { status: 201 });
  } catch (error) {
    return calendarError(error, "POST");
  }
}

export async function PATCH(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;

  try {
    const cal = getCalendarClient();
    if (!cal) return NextResponse.json({ error: "Google Calendar not configured" }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const eventId = text(body.eventId, 512);
    const calendarId = text(body.calendarId || "primary", 512) || "primary";
    if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (body.summary !== undefined) {
      const summary = text(body.summary, 200);
      if (!summary) return NextResponse.json({ error: "summary cannot be empty" }, { status: 400 });
      patch.summary = summary;
    }
    if (body.description !== undefined) patch.description = text(body.description, 4000);
    if (body.location !== undefined) patch.location = text(body.location, 500);
    if (body.start !== undefined || body.end !== undefined) {
      if (Boolean(body.allDay)) {
        const range = allDayRange(body.start, body.end);
        if (!range) return NextResponse.json({ error: "Valid all-day range is required" }, { status: 400 });
        patch.start = { date: range.start };
        patch.end = { date: range.end };
      } else {
        const range = eventRange(body.start, body.end);
        if (!range) return NextResponse.json({ error: "Valid start and end are required" }, { status: 400 });
        patch.start = { dateTime: range.start, timeZone: "Europe/Madrid" };
        patch.end = { dateTime: range.end, timeZone: "Europe/Madrid" };
      }
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No valid updates supplied" }, { status: 400 });
    await cal.events.patch({
      calendarId,
      eventId,
      requestBody: patch as Parameters<typeof cal.events.patch>[0] extends { requestBody?: infer R } ? R : never,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return calendarError(error, "PATCH");
  }
}

export async function DELETE(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;

  try {
    const cal = getCalendarClient();
    if (!cal) return NextResponse.json({ error: "Google Calendar not configured" }, { status: 503 });
    const body = await req.json().catch(() => ({}));
    const eventId = text(body.eventId, 512);
    const calendarId = text(body.calendarId || "primary", 512) || "primary";
    if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    await cal.events.delete({ calendarId, eventId });
    return NextResponse.json({ success: true });
  } catch (error) {
    return calendarError(error, "DELETE");
  }
}
