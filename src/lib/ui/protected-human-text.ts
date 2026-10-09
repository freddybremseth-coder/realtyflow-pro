const NAME_WORD =
  String.raw`(?:[\p{Lu}][\p{L}\p{M}\d'’.-]*|[A-ZÆØÅÁÉÍÓÚÜÑ]{2,}|SoMe)`;

const MULTIWORD_NAME = new RegExp(
  String.raw`(^|[\s(\["“])(${NAME_WORD}(?:\s+${NAME_WORD}){1,4})(?=$|[\s.,;:!?\)\]"”])`,
  "gu",
);

/**
 * Display-only protection for human-facing names.
 *
 * Keeps likely multi-word proper names together in compact cards by replacing
 * the spaces inside the name with non-breaking spaces. Persisted/published
 * content must continue using the original string.
 */
export function protectHumanText(value: string | null | undefined): string {
  if (!value) return value || "";

  return value.replace(MULTIWORD_NAME, (_match, prefix: string, name: string) => {
    return prefix + name.replace(/\s+/g, "\u00A0");
  });
}
