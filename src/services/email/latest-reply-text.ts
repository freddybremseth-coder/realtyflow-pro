const REPLY_BOUNDARIES = [
  /^\s*>/m,
  /^\s*_{5,}\s*$/m,
  /^\s*-{5,}\s*Original Message\s*-{5,}\s*$/im,
  /^\s*(?:From|Fra):\s.+$/im,
  /^\s*(?:On|Den)\s.+(?:wrote|skrev):?\s*$/im,
  /^\s*(?:man\.|tir\.|ons\.|tor\.|fre\.|lør\.|søn\.|mon\.|tue\.|wed\.|thu\.|fri\.|sat\.|sun\.)\s.+(?:skrev|wrote)\s.+:?\s*$/im,
];

function htmlToText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

export function extractLatestReplyText(value: string | null | undefined) {
  const source = htmlToText(String(value || ""))
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (!source) return "";

  let cutAt = source.length;
  for (const pattern of REPLY_BOUNDARIES) {
    const match = pattern.exec(source);
    if (match && match.index >= 0) cutAt = Math.min(cutAt, match.index);
  }

  return source
    .slice(0, cutAt)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
