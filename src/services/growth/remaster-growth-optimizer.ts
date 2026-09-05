import { askClaude } from "@/services/ai/claude-client";

function extractJson(text: string) {
  const stripped = text.replace(/```(?:json)?/g, "").trim();
  try { return JSON.parse(stripped); } catch { /* continue */ }
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
  throw new Error("Could not parse Re-Master metadata optimization response");
}

export async function generateRemasterMetadataRefresh(input: {
  title: string;
  description: string;
  tags: string[];
  viewCount: number;
  viewsPerDay: number;
  channelMedianViewsPerDay: number;
  topTitles: string[];
}) {
  const response = await askClaude(JSON.stringify(input), {
    maxTokens: 1800,
    temperature: 0.45,
    systemPrompt: `You optimize metadata for the verified Re-Master Freddy YouTube music channel.
Return ONLY JSON with this shape: {"description":"...","tags":["..."]}.
Do not change or propose the title. Do not invent awards, chart positions, listener counts, artist collaborations, licenses, genres or factual claims not supported by the supplied metadata.
Description should be natural English, useful to a music listener, 700-1800 characters, include relevant search phrases without keyword stuffing, and invite listening/subscription naturally.
Tags: 12-25 concise relevant tags, under YouTube limits, derived from the title/current metadata and patterns in supplied top-performing titles.
The goal is sustainable discovery and listeners, not clickbait.`,
  });
  const parsed = extractJson(response) as { description?: unknown; tags?: unknown };
  const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
  const tags = Array.isArray(parsed.tags) ? [...new Set(parsed.tags.map(String).map((tag) => tag.trim()).filter(Boolean))].slice(0, 25) : [];
  if (description.length < 200 || tags.length < 5) throw new Error("Generated Re-Master metadata did not meet minimum quality requirements");
  return { description, tags };
}

function tokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((word) => word.length >= 3));
}

export function selectBestRemasterPlaylist(videoTitle: string, playlists: Array<{ playlistId: string; title: string; description?: string }>) {
  const videoTokens = tokens(videoTitle);
  let best: { playlistId: string; title: string; score: number } | null = null;
  for (const playlist of playlists) {
    const candidate = tokens(`${playlist.title} ${playlist.description || ""}`);
    let score = 0;
    for (const token of videoTokens) if (candidate.has(token)) score += 1;
    if (!best || score > best.score) best = { playlistId: playlist.playlistId, title: playlist.title, score };
  }
  return best && best.score > 0 ? best : null;
}
