import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

function getOAuth2Client() {
  const clientId = process.env.YOUTUBE_CLIENT_ID; // reuse existing Google OAuth
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function getCalendarClient() {
  const auth = getOAuth2Client();
  if (!auth) return null;
  return google.calendar({ version: "v3", auth });
}

/**
 * GET /api/calendar
 * ?action=list_calendars → list all calendars
 * ?start=ISO&end=ISO → list events in range (across all visible calendars)
 * ?calendarId=xxx&start=ISO&end=ISO → list events for specific calendar
 */
export async function GET(req: NextRequest) {
  try {
    const cal = getCalendarClient();
    if (!cal) {
      return NextResponse.json({ configured: false, calendars: [], events: [] });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "list_calendars") {
      const res = await cal.calendarList.list();
      const calendars = (res.data.items || []).map((c) => ({
        id: c.id,
        summary: c.summary,
        description: c.description,
        backgroundColor: c.backgroundColor,
        foregroundColor: c.foregroundColor,
        primary: c.primary || false,
        accessRole: c.accessRole,
      }));
      return NextResponse.json({ configured: true, calendars });
    }

    // List events
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const calendarId = searchParams.get("calendarId");

    if (!start || !end) {
      return NextResponse.json({ error: "start and end parameters required" }, { status: 400 });
    }

    const calendarIds: string[] = [];
    if (calendarId) {
      calendarIds.push(calendarId);
    } else {
      // Fetch all calendars and query events from each
      const calList = await cal.calendarList.list();
      for (const c of calList.data.items || []) {
        if (c.id && c.accessRole !== "freeBusyReader") {
          calendarIds.push(c.id);
        }
      }
    }

    const allEvents: Array<Record<string, unknown>> = [];

    for (const cId of calendarIds) {
      try {
        const res = await cal.events.list({
          calendarId: cId,
          timeMin: start,
          timeMax: end,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 250,
        });

        for (const ev of res.data.items || []) {
          allEvents.push({
            id: ev.id,
            calendarId: cId,
            summary: ev.summary || "(Uten tittel)",
            description: ev.description || "",
            location: ev.location || "",
            start: ev.start?.dateTime || ev.start?.date || "",
            end: ev.end?.dateTime || ev.end?.date || "",
            allDay: !ev.start?.dateTime,
            status: ev.status,
            htmlLink: ev.htmlLink,
            colorId: ev.colorId,
            creator: ev.creator?.email || "",
            attendees: (ev.attendees || []).map((a) => ({
              email: a.email,
              displayName: a.displayName,
              responseStatus: a.responseStatus,
            })),
          });
        }
      } catch (err) {
        console.error(`[Calendar] Error fetching from ${cId}:`, err);
      }
    }

    // Sort by start time
    allEvents.sort((a, b) => {
      const aTime = new Date(a.start as string).getTime();
      const bTime = new Date(b.start as string).getTime();
      return aTime - bTime;
    });

    return NextResponse.json({ configured: true, events: allEvents });
  } catch (error) {
    console.error("[Calendar API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/calendar - Create event
 * Body: { calendarId?, summary, description?, location?, start, end, allDay? }
 */
export async function POST(req: NextRequest) {
  try {
    const cal = getCalendarClient();
    if (!cal) {
      return NextResponse.json({ error: "Google Calendar not configured" }, { status: 503 });
    }

    const body = await req.json();
    const { calendarId = "primary", summary, description, location, start, end, allDay } = body;

    if (!summary || !start) {
      return NextResponse.json({ error: "summary and start required" }, { status: 400 });
    }

    const eventBody: Record<string, unknown> = {
      summary,
      description: description || "",
      location: location || "",
    };

    if (allDay) {
      eventBody.start = { date: start.split("T")[0] };
      eventBody.end = { date: (end || start).split("T")[0] };
    } else {
      eventBody.start = { dateTime: start, timeZone: "Europe/Madrid" };
      eventBody.end = { dateTime: end || start, timeZone: "Europe/Madrid" };
    }

    const res = await cal.events.insert({
      calendarId,
      requestBody: eventBody as Parameters<typeof cal.events.insert>[0] extends { requestBody?: infer R } ? R : never,
    });

    return NextResponse.json({
      id: res.data.id,
      summary: res.data.summary,
      start: res.data.start?.dateTime || res.data.start?.date,
      end: res.data.end?.dateTime || res.data.end?.date,
      htmlLink: res.data.htmlLink,
    }, { status: 201 });
  } catch (error) {
    console.error("[Calendar API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/calendar - Update event
 * Body: { eventId, calendarId?, summary?, description?, location?, start?, end? }
 */
export async function PATCH(req: NextRequest) {
  try {
    const cal = getCalendarClient();
    if (!cal) {
      return NextResponse.json({ error: "Google Calendar not configured" }, { status: 503 });
    }

    const body = await req.json();
    const { eventId, calendarId = "primary", summary, description, location, start, end, allDay } = body;

    if (!eventId) {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (summary !== undefined) patch.summary = summary;
    if (description !== undefined) patch.description = description;
    if (location !== undefined) patch.location = location;
    if (start) {
      patch.start = allDay ? { date: start.split("T")[0] } : { dateTime: start, timeZone: "Europe/Madrid" };
    }
    if (end) {
      patch.end = allDay ? { date: end.split("T")[0] } : { dateTime: end, timeZone: "Europe/Madrid" };
    }

    await cal.events.patch({
      calendarId,
      eventId,
      requestBody: patch as Parameters<typeof cal.events.patch>[0] extends { requestBody?: infer R } ? R : never,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Calendar API] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/calendar - Delete event
 * Body: { eventId, calendarId? }
 */
export async function DELETE(req: NextRequest) {
  try {
    const cal = getCalendarClient();
    if (!cal) {
      return NextResponse.json({ error: "Google Calendar not configured" }, { status: 503 });
    }

    const body = await req.json();
    const { eventId, calendarId = "primary" } = body;

    if (!eventId) {
      return NextResponse.json({ error: "eventId required" }, { status: 400 });
    }

    await cal.events.delete({ calendarId, eventId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Calendar API] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
