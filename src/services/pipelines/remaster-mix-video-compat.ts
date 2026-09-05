const WIDTH = 1920;
const HEIGHT = 1080;

function assTime(seconds: number) {
  const centiseconds = Math.max(1, Math.ceil(Math.max(0, seconds) * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const cs = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(value: string) {
  return String(value || "").replace(/\\/g, "/").replace(/[{}]/g, "").replace(/\r?\n/g, "\\N").trim();
}

function assDocument(events: string[]) {
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${WIDTH}`, `PlayResY: ${HEIGHT}`,
    "WrapStyle: 2", "ScaledBorderAndShadow: yes", "YCbCr Matrix: TV.709", "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    "Style: Watermark,DejaVu Sans,27,&H00FFFFFF,&H000000FF,&H70000000,&H70000000,-1,0,0,0,100,100,0,0,3,0,0,9,34,34,30,1",
    "Style: Sponsor,DejaVu Sans,58,&H00FFFFFF,&H000000FF,&H61000000,&H61000000,-1,0,0,0,100,100,0,0,3,0,0,5,30,30,20,1",
    "Style: CTA,DejaVu Sans,30,&H00FFFFFF,&H000000FF,&H70000000,&H70000000,0,0,0,0,100,100,0,0,3,0,0,5,40,40,20,1",
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events, "",
  ].join("\n");
}

export function buildRemasterMixAssOverlay(input: { durationSeconds: number; sponsorSlide: boolean; ctaText?: string | null; zenEcoHomesEnabled: boolean }) {
  if (!input.zenEcoHomesEnabled) return "";
  const end = assTime(input.durationSeconds);
  const events = [`Dialogue: 0,0:00:00.00,${end},Watermark,,0,0,0,,ZenEcoHomes.com`];
  if (input.sponsorSlide) {
    events.push(`Dialogue: 1,0:00:00.00,${end},Sponsor,,0,0,0,,{\\pos(960,464)}Presented by ZenEcoHomes.com`);
    if (input.ctaText?.trim()) events.push(`Dialogue: 1,0:00:00.00,${end},CTA,,0,0,0,,{\\pos(960,594)}${escapeAssText(input.ctaText)}`);
  }
  return assDocument(events);
}

export function buildRemasterMixGlobalAssOverlay(input: { durationSeconds: number; sponsorIntervalMinutes: number; ctaText?: string | null; zenEcoHomesEnabled: boolean }) {
  if (!input.zenEcoHomesEnabled) return "";
  const duration = Math.max(1, input.durationSeconds);
  const events = [`Dialogue: 0,0:00:00.00,${assTime(duration)},Watermark,,0,0,0,,ZenEcoHomes.com`];
  const interval = Math.max(5, input.sponsorIntervalMinutes) * 60;
  const sponsorDuration = Math.min(12, Math.max(7, interval * 0.08));
  for (let start = 0; start < duration; start += interval) {
    const end = Math.min(duration, start + sponsorDuration);
    events.push(`Dialogue: 1,${assTime(start)},${assTime(end)},Sponsor,,0,0,0,,{\\pos(960,464)}Presented by ZenEcoHomes.com`);
    if (input.ctaText?.trim()) events.push(`Dialogue: 1,${assTime(start)},${assTime(end)},CTA,,0,0,0,,{\\pos(960,594)}${escapeAssText(input.ctaText)}`);
  }
  return assDocument(events);
}

function escapeConcatPath(value: string) { return value.replace(/'/g, "'\\''"); }

export function buildVisualConcatFile(imagePaths: string[], segmentDuration: number) {
  if (!imagePaths.length) return "";
  const duration = Math.max(0.1, segmentDuration).toFixed(6);
  const lines: string[] = ["ffconcat version 1.0"];
  for (const imagePath of imagePaths) { lines.push(`file '${escapeConcatPath(imagePath)}'`); lines.push(`duration ${duration}`); }
  lines.push(`file '${escapeConcatPath(imagePaths[imagePaths.length - 1])}'`);
  return `${lines.join("\n")}\n`;
}
