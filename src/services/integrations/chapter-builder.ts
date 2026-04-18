/**
 * YouTube chapter builder — generates a chapter block for the video description.
 *
 * YouTube's rules for auto-detected chapters:
 *  1. The first timestamp MUST be 00:00.
 *  2. At least 3 timestamps are required.
 *  3. Chapters must be ≥10 seconds apart.
 *  4. Timestamps must be in ascending order.
 *  5. Format `M:SS` or `MM:SS` or `H:MM:SS`.
 *
 * The generated block is ready to splice into the description. Example output:
 *   ⏱ CHAPTERS
 *   00:00 Intro
 *   00:18 Build-up
 *   00:48 Drop
 *   02:10 Breakdown
 *   03:00 Outro
 */

export interface ChapterMarker {
  /** Seconds from track start. */
  t: number;
  /** Human-readable label shown in the YouTube player. */
  label: string;
}

export interface ChapterResult {
  /** Full block to append to description (includes heading + newlines). */
  block: string;
  /** Structured markers, useful for SSE / persistence. */
  markers: ChapterMarker[];
}

// ─── Label pools per mood ────────────────────────────────────

const LABEL_TEMPLATES: Record<string, string[]> = {
  energetic: ['Intro', 'Build-up', 'Drop', 'Breakdown', 'Second Drop', 'Outro'],
  chill: ['Intro', 'Warm-up', 'Groove', 'Peak', 'Fade', 'Outro'],
  romantic: ['Intro', 'Rise', 'Main Theme', 'Hook', 'Soft Break', 'Outro'],
  dark: ['Intro', 'Tension', 'Drop', 'Low Section', 'Return', 'Outro'],
  focus: ['Intro', 'Flow Begins', 'Deep Zone', 'Peak Focus', 'Cooldown', 'Outro'],
  default: ['Intro', 'Build', 'Main', 'Bridge', 'Climax', 'Outro'],
};

function pickLabels(mood?: string, genre?: string): string[] {
  const m = (mood || '').toLowerCase();
  const g = (genre || '').toLowerCase();
  if (m.includes('energ') || g.includes('edm') || g.includes('house') || g.includes('techno')) {
    return LABEL_TEMPLATES.energetic;
  }
  if (m.includes('chill') || g.includes('lo-fi') || g.includes('lofi') || g.includes('ambient')) {
    return LABEL_TEMPLATES.chill;
  }
  if (m.includes('romant') || m.includes('love') || g.includes('r&b') || g.includes('soul')) {
    return LABEL_TEMPLATES.romantic;
  }
  if (m.includes('dark') || m.includes('melancholic') || g.includes('trap')) {
    return LABEL_TEMPLATES.dark;
  }
  if (m.includes('focus') || m.includes('study') || m.includes('concentration')) {
    return LABEL_TEMPLATES.focus;
  }
  return LABEL_TEMPLATES.default;
}

// ─── Timestamp formatter ─────────────────────────────────────

function formatTimestamp(secondsTotal: number): string {
  const s = Math.max(0, Math.floor(secondsTotal));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

// ─── Main builder ────────────────────────────────────────────

/**
 * Build YouTube chapter markers for a track.
 *
 * Strategy:
 *  - Very short tracks (<40s): return empty — not worth chaptering, fails YT rules.
 *  - Short tracks (40-75s): 3 chapters (Intro → Main → Outro).
 *  - Medium (75-180s): 4 chapters.
 *  - Long (180s+): 5 chapters, with a Drop/Peak mid-track.
 *
 * First marker is always 00:00. Chapters are spaced ≥12s apart to satisfy YT's
 * ≥10s rule with safety margin.
 */
export function buildChapters(
  durationSec: number,
  options: { mood?: string; genre?: string } = {},
): ChapterResult {
  const duration = Math.max(0, Math.floor(durationSec));
  if (duration < 40) {
    return { block: '', markers: [] };
  }

  const labels = pickLabels(options.mood, options.genre);
  let count: number;
  if (duration < 75) count = 3;
  else if (duration < 180) count = 4;
  else if (duration < 300) count = 5;
  else count = 6;

  // Distribute chapters. First at 00:00, last chapter (outro) at ~85% mark.
  const outroStart = Math.floor(duration * 0.85);
  const middleEnd = outroStart;
  const middleCount = count - 2; // excluding Intro at 0 and Outro

  const markers: ChapterMarker[] = [{ t: 0, label: labels[0] }];

  if (middleCount > 0) {
    // Spread middle markers evenly between ~8% and outroStart
    const middleStartPct = 0.08;
    const middleStartSec = Math.floor(duration * middleStartPct);
    const span = middleEnd - middleStartSec;

    for (let i = 0; i < middleCount; i++) {
      const pct = middleCount === 1 ? 0.5 : i / (middleCount - 1);
      const t = Math.floor(middleStartSec + span * pct * 0.9); // pull inward slightly
      // Enforce ≥12s from previous
      const prev = markers[markers.length - 1].t;
      markers.push({ t: Math.max(t, prev + 12), label: labels[i + 1] || `Section ${i + 2}` });
    }
  }

  // Outro
  const outroT = Math.max(outroStart, markers[markers.length - 1].t + 12);
  if (outroT < duration - 5) {
    markers.push({ t: outroT, label: labels[labels.length - 1] });
  }

  // Dedupe any that slipped within 12s after clamping
  const deduped: ChapterMarker[] = [];
  for (const m of markers) {
    const last = deduped[deduped.length - 1];
    if (!last || m.t - last.t >= 12) deduped.push(m);
  }

  // YouTube requires ≥3 chapters. If we ended up with fewer, drop the block.
  if (deduped.length < 3) {
    return { block: '', markers: [] };
  }

  const lines = deduped.map((m) => `${formatTimestamp(m.t)} ${m.label}`);
  const block = ['⏱ CHAPTERS', ...lines].join('\n');

  return { block, markers: deduped };
}

/**
 * Splice a chapter block into an existing description. Placed after the opening
 * paragraph (double-newline boundary) so the hook remains the first line — that
 * drives the thumbnail-adjacent preview text.
 */
export function injectChaptersIntoDescription(description: string, chapterBlock: string): string {
  if (!chapterBlock) return description;
  if (!description) return chapterBlock;

  const parts = description.split(/\n\n/);
  if (parts.length <= 1) {
    return `${description}\n\n${chapterBlock}`;
  }
  // Insert after the first paragraph
  const [opener, ...rest] = parts;
  return [opener, chapterBlock, ...rest].join('\n\n');
}
