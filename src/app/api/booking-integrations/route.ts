import { NextResponse } from "next/server";
import { getCalendarSyncStatus } from "@/lib/calendar-sync";
import { isSmsConfigured } from "@/lib/sms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pick<T>(value: T | undefined | null): value is T {
  return Boolean(value);
}

function relativeTime(date: Date | null) {
  if (!date) return null;
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "for under et minutt siden";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `for ${minutes} minutt${minutes === 1 ? "" : "er"} siden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `for ${hours} time${hours === 1 ? "" : "r"} siden`;
  const days = Math.round(hours / 24);
  return `for ${days} dag${days === 1 ? "" : "er"} siden`;
}

export async function GET() {
  const resend = pick(process.env.RESEND_API_KEY);
  const smtp = pick(process.env.SMTP_HOST) && pick(process.env.SMTP_USER) && pick(process.env.SMTP_PASS);
  const googleConfigured =
    pick(process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) &&
    pick(process.env.YOUTUBE_CLIENT_ID) &&
    pick(process.env.YOUTUBE_CLIENT_SECRET);
  const calendarLabel = process.env.GOOGLE_CALENDAR_DEFAULT_ID || "primary";
  const smsConfigured = isSmsConfigured();
  const sync = getCalendarSyncStatus();

  return NextResponse.json({
    email: {
      configured: resend || smtp,
      provider: resend ? "resend" : smtp ? "smtp" : null,
      lead: resend ? "Resend API" : smtp ? "SMTP" : "Mangler",
    },
    sms: {
      configured: smsConfigured,
      provider: smsConfigured ? "twilio" : null,
      lead: smsConfigured ? "Sender via Twilio" : "Twilio mangler (TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM)",
    },
    calendarInvite: {
      configured: googleConfigured,
      lead: googleConfigured ? "Sender via Google Calendar" : "Krever Google Calendar",
    },
    googleCalendar: {
      configured: googleConfigured,
      calendarId: googleConfigured ? calendarLabel : null,
      lead: googleConfigured ? "Free/busy via Google Calendar" : "Token mangler",
      lastSyncedAt: sync.lastSyncedAt ? sync.lastSyncedAt.toISOString() : null,
      lastSyncedRelative: relativeTime(sync.lastSyncedAt),
      syncCount: sync.lastSyncCount,
    },
  });
}
