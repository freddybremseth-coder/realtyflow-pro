import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...corsHeaders, ...(init?.headers || {}) },
  });
}

function getCalendarClient() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth: oauth2 });
}

function expandBusyWithBuffer(busy: Array<{ start?: string | null; end?: string | null }>, bufferMinutes: number) {
  return busy
    .filter((item) => item.start && item.end)
    .map((item) => {
      const start = new Date(String(item.start));
      const end = new Date(String(item.end));
      start.setMinutes(start.getMinutes() - bufferMinutes);
      end.setMinutes(end.getMinutes() + bufferMinutes);
      return { start: start.toISOString(), end: end.toISOString() };
    });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const calendar = getCalendarClient();
    const start = request.nextUrl.searchParams.get("start");
    const end = request.nextUrl.searchParams.get("end");
    const buffer = Number(request.nextUrl.searchParams.get("buffer") || 30);
    const calendarId = request.nextUrl.searchParams.get("calendarId") || "primary";

    if (!start || !end) return json({ error: "start and end are required" }, { status: 400 });
    if (!calendar) return json({ configured: false, busy: [] });

    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: start,
        timeMax: end,
        items: [{ id: calendarId }],
      },
    });

    const busy = res.data.calendars?.[calendarId]?.busy || [];
    return json({
      configured: true,
      calendarId,
      bufferMinutes: Number.isFinite(buffer) ? buffer : 30,
      busy: expandBusyWithBuffer(busy, Number.isFinite(buffer) ? buffer : 30),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown booking availability error";
    if (/invalid_grant|invalid credentials|unauthorized/i.test(message)) {
      return json({ configured: false, busy: [], warning: "Google Calendar token is invalid" });
    }
    return json(
      { error: message },
      { status: 500 },
    );
  }
}
