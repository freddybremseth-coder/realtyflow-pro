/**
 * publish-time-picker — chooses the best upcoming ISO datetime to publish a
 * music video, based on:
 *
 *   1. Genre/mood-specific YouTube traffic patterns (global defaults)
 *   2. Channel-specific performance history (recent songs + their views)
 *
 * Falls back to genre defaults if no historical data exists yet.
 *
 * All times are evaluated in the channel's timezone (default UTC, override
 * via env YOUTUBE_CHANNEL_TZ like "Europe/Oslo" or "America/New_York").
 */

import { createClient } from '@supabase/supabase-js';

// ─── Genre → best hour ranges (local time) ──────────────────
//
// Source: aggregated YouTube Music category insights. These are evergreen
// sweet-spots, not absolute truths — the historical-weighting step below
// refines them with whatever the channel actually sees.

interface GenreWindow {
  hours: number[];       // Preferred local hours (24h). Earlier = earlier in list.
  days: number[];        // Preferred days of week (0=Sun ... 6=Sat).
  description: string;
}

const GENRE_WINDOWS: Record<string, GenreWindow> = {
  chill: {
    hours: [21, 20, 22, 19, 23],
    days: [5, 6, 0, 4, 1],  // Fri, Sat, Sun, Thu, Mon
    description: 'evening listening, weekend-heavy',
  },
  lofi: {
    hours: [20, 21, 22, 8, 9],
    days: [0, 1, 2, 3, 4],  // Weekdays
    description: 'weekday evenings + study mornings',
  },
  focus: {
    hours: [8, 9, 10, 14, 15],
    days: [1, 2, 3, 4, 0],  // Mon-Thu, Sun
    description: 'weekday work hours',
  },
  energetic: {
    hours: [18, 19, 20, 17, 21],
    days: [5, 6, 4, 3, 0],
    description: 'Friday/Saturday prime-time',
  },
  edm: {
    hours: [20, 21, 22, 23, 19],
    days: [5, 6, 4, 3, 0],
    description: 'weekend nights',
  },
  house: {
    hours: [21, 22, 20, 23, 19],
    days: [5, 6, 4, 3, 0],
    description: 'weekend nights',
  },
  techno: {
    hours: [22, 23, 21, 0, 20],
    days: [5, 6, 4],
    description: 'late weekend',
  },
  trap: {
    hours: [19, 20, 21, 18, 22],
    days: [5, 6, 4, 3, 0],
    description: 'weekend evenings',
  },
  romantic: {
    hours: [20, 21, 19, 22, 18],
    days: [5, 6, 0, 4, 1],
    description: 'Friday evening + Sunday',
  },
  dark: {
    hours: [21, 22, 23, 20, 0],
    days: [5, 6, 4, 3, 0],
    description: 'late nights',
  },
  default: {
    hours: [18, 19, 20, 21, 17],
    days: [4, 5, 3, 2, 6],
    description: 'Wed-Sat evenings',
  },
};

function pickWindow(mood?: string, genre?: string): GenreWindow {
  const m = (mood || '').toLowerCase();
  const g = (genre || '').toLowerCase();
  if (m.includes('focus') || m.includes('study') || m.includes('concentration')) return GENRE_WINDOWS.focus;
  if (g.includes('lo-fi') || g.includes('lofi')) return GENRE_WINDOWS.lofi;
  if (m.includes('chill') || g.includes('ambient')) return GENRE_WINDOWS.chill;
  if (g.includes('edm')) return GENRE_WINDOWS.edm;
  if (g.includes('house')) return GENRE_WINDOWS.house;
  if (g.includes('techno')) return GENRE_WINDOWS.techno;
  if (g.includes('trap')) return GENRE_WINDOWS.trap;
  if (m.includes('romant') || g.includes('r&b') || g.includes('soul')) return GENRE_WINDOWS.romantic;
  if (m.includes('dark') || m.includes('melancholic')) return GENRE_WINDOWS.dark;
  if (m.includes('energ')) return GENRE_WINDOWS.energetic;
  return GENRE_WINDOWS.default;
}

// ─── Historical weighting ───────────────────────────────────

interface SongHistoryRow {
  created_at?: string;
  youtube_url?: string;
  ai_metadata?: Record<string, unknown> | null;
  view_count?: number | null;
  genre?: string | null;
  mood?: string | null;
}

/**
 * Pull up to 100 recent songs with YouTube URLs and known view counts, return
 * { hour, day, views } so we can adjust the window.
 */
async function fetchHistory(genre?: string, mood?: string): Promise<Array<{ hour: number; day: number; weight: number }>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const supabase = createClient(url, key);
    let query = supabase
      .from('songs')
      .select('created_at, youtube_url, ai_metadata, view_count, genre, mood')
      .not('youtube_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    // Filter to similar-genre matches when available — similar tracks publish at similar times.
    if (genre) query = query.ilike('genre', `%${genre}%`);

    const { data, error } = await query;
    if (error || !data) return [];

    const rows = data as SongHistoryRow[];
    const out: Array<{ hour: number; day: number; weight: number }> = [];
    for (const row of rows) {
      const isoRaw =
        ((row.ai_metadata as Record<string, unknown>)?.scheduledPublishAt as string | undefined) ||
        ((row.ai_metadata as Record<string, unknown>)?.publishedAt as string | undefined) ||
        row.created_at;
      if (!isoRaw) continue;
      const d = new Date(isoRaw);
      if (isNaN(d.getTime())) continue;
      const views = Number(row.view_count || 0);
      const weight = Math.max(1, Math.log10(views + 10));
      out.push({ hour: d.getUTCHours(), day: d.getUTCDay(), weight });
      // Mood argument reserved for future granular weighting
      void mood;
    }
    return out;
  } catch {
    return [];
  }
}

// ─── Scoring ────────────────────────────────────────────────

function scoreCandidate(
  candidateHour: number,
  candidateDay: number,
  window: GenreWindow,
  history: Array<{ hour: number; day: number; weight: number }>,
): number {
  // Base score from genre defaults (earlier in the list = higher score)
  const hourRank = window.hours.indexOf(candidateHour);
  const dayRank = window.days.indexOf(candidateDay);
  let score = 0;
  if (hourRank >= 0) score += (window.hours.length - hourRank) * 10;
  if (dayRank >= 0) score += (window.days.length - dayRank) * 5;

  // Historical bonus: exact hour+day match adds full weight, hour-only match
  // adds half, day-only adds quarter.
  for (const h of history) {
    if (h.hour === candidateHour && h.day === candidateDay) {
      score += h.weight * 4;
    } else if (h.hour === candidateHour) {
      score += h.weight * 2;
    } else if (h.day === candidateDay) {
      score += h.weight;
    }
  }

  return score;
}

// ─── Main: pickBestPublishTime ──────────────────────────────

export interface BestPublishTimeResult {
  /** ISO datetime string — ready to pass to YouTube as publishAt. */
  isoDate: string;
  /** Human summary for logs/UI. */
  reason: string;
  /** Minutes from now until publish (≥ 15 min to give YouTube a buffer). */
  minutesFromNow: number;
}

/**
 * Pick the best upcoming UTC datetime to publish. Looks up to 7 days ahead,
 * scores each (day, hour) candidate, picks the highest.
 *
 * Always returns at least 30 minutes in the future — YouTube rejects schedules
 * too close to upload time and occasionally needs a buffer to finish processing.
 */
export async function pickBestPublishTime(options: {
  mood?: string;
  genre?: string;
  /** Lower bound in minutes from now (default 30). */
  minLeadMinutes?: number;
  /** Upper bound in days from now (default 7). */
  maxAheadDays?: number;
}): Promise<BestPublishTimeResult> {
  const minLead = options.minLeadMinutes ?? 30;
  const maxAhead = options.maxAheadDays ?? 7;
  const window = pickWindow(options.mood, options.genre);
  const history = await fetchHistory(options.genre, options.mood);

  const now = new Date();
  const earliest = new Date(now.getTime() + minLead * 60 * 1000);
  const latest = new Date(now.getTime() + maxAhead * 24 * 60 * 60 * 1000);

  // Generate hourly candidates in the window
  let best: { date: Date; score: number; hour: number; day: number } | null = null;
  const cursor = new Date(earliest);
  cursor.setUTCMinutes(0, 0, 0); // Round to top of hour
  cursor.setUTCHours(cursor.getUTCHours() + 1); // Move to next full hour

  while (cursor <= latest) {
    const hour = cursor.getUTCHours();
    const day = cursor.getUTCDay();
    const score = scoreCandidate(hour, day, window, history);
    if (score > 0 && (!best || score > best.score)) {
      best = { date: new Date(cursor), score, hour, day };
    }
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }

  if (!best) {
    // No candidate hit the window within 7 days — default to tomorrow at window[0]
    const fallback = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    fallback.setUTCHours(window.hours[0], 0, 0, 0);
    return {
      isoDate: fallback.toISOString(),
      reason: `Fallback: ${window.description} (no history match)`,
      minutesFromNow: Math.round((fallback.getTime() - now.getTime()) / 60000),
    };
  }

  return {
    isoDate: best.date.toISOString(),
    reason: `${window.description} + channel history (score ${best.score.toFixed(1)})`,
    minutesFromNow: Math.round((best.date.getTime() - now.getTime()) / 60000),
  };
}
