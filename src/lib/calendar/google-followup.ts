import { google } from "googleapis";

export interface GoogleFollowupEventInput {
  title: string;
  startIso: string;
  durationMinutes: number;
  description?: string | null;
}

export async function createGoogleFollowupEvent(input: GoogleFollowupEventInput) {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    return { created: false as const, configured: false as const, eventId: null, href: null, error: "Google Calendar is not configured" };
  }

  const start = new Date(input.startIso);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid calendar start time");
  const end = new Date(start.getTime() + Math.max(10, Math.min(180, input.durationMinutes)) * 60_000);

  try {
    const oauth = new google.auth.OAuth2(clientId, clientSecret);
    oauth.setCredentials({ refresh_token: refreshToken });
    const calendar = google.calendar({ version: "v3", auth: oauth });
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: input.title.slice(0, 180),
        description: input.description?.slice(0, 4000) || undefined,
        start: { dateTime: start.toISOString(), timeZone: "Europe/Madrid" },
        end: { dateTime: end.toISOString(), timeZone: "Europe/Madrid" },
      },
    });
    return {
      created: true as const,
      configured: true as const,
      eventId: response.data.id || null,
      href: response.data.htmlLink || null,
      error: null,
    };
  } catch (error) {
    return {
      created: false as const,
      configured: true as const,
      eventId: null,
      href: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
