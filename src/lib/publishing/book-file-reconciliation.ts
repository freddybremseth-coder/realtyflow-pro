export type CatalogBook = { id: string; title: string; language: string; ebook_file_path?: string | null };
export type StorageBookFile = { name: string; bucket_id?: string; created_at?: string | null };

const NOISE = new Set([
  "freddy", "bremseth", "final", "publisher", "edition", "master", "ebook", "ebok",
  "english", "norsk", "norwegian", "spanish", "reflowable", "complete", "manuscript",
  "v1", "v2", "v3", "v4", "v5", "2026",
]);

export function canonicalFileKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*\(\d+\)(?=\.[^.]+$)/, "")
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && !NOISE.has(token) && !/^v\d+$/.test(token))
    .join(" ");
}

function tokens(value: string) {
  return new Set(canonicalFileKey(value).split(" ").filter((token) => token.length > 1));
}

function inferredLanguage(name: string) {
  const lower = name.toLowerCase();
  if (/(_no\b|norsk|norwegian)/.test(lower)) return "no";
  if (/(_es\b|spanish|espanol)/.test(lower)) return "es";
  if (/(_en\b|english)/.test(lower)) return "en";
  return null;
}

export function scoreBookFileMatch(book: CatalogBook, file: StorageBookFile) {
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  if (!['epub', 'pdf'].includes(extension)) return null;
  const bookKey = canonicalFileKey(book.title);
  const fileKey = canonicalFileKey(file.name);
  if (!bookKey || !fileKey) return null;
  const language = inferredLanguage(file.name);
  if (language && book.language && language !== book.language.toLowerCase()) return null;

  if (bookKey === fileKey) return { confidence: 1, matchType: "exact" as const };
  const bookTokens = tokens(book.title);
  const fileTokens = tokens(file.name);
  if (bookTokens.size === 0) return null;
  const overlap = [...bookTokens].filter((token) => fileTokens.has(token)).length;
  const coverage = overlap / bookTokens.size;
  const precision = overlap / Math.max(fileTokens.size, 1);
  const confidence = Number((coverage * 0.7 + precision * 0.3).toFixed(3));
  if (coverage === 1 && confidence >= 0.78) return { confidence, matchType: "strong" as const };
  return null;
}

export function buildFileReconciliationCandidates(books: CatalogBook[], files: StorageBookFile[]) {
  const assignedPaths = new Set(books.map((book) => book.ebook_file_path).filter(Boolean));
  const unassignedFiles = files.filter((file) => !assignedPaths.has(file.name));
  const duplicateGroups = new Map<string, StorageBookFile[]>();
  for (const file of files) {
    const key = file.name.toLowerCase().replace(/\s*\(\d+\)(?=\.[^.]+$)/, "");
    duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), file]);
  }

  const links = books
    .filter((book) => !book.ebook_file_path)
    .flatMap((book) => unassignedFiles.map((file) => ({ book, file, score: scoreBookFileMatch(book, file) })).filter((row) => row.score))
    .sort((a, b) => (b.score?.confidence || 0) - (a.score?.confidence || 0)
      || Number(b.file.name.toLowerCase().endsWith(".epub")) - Number(a.file.name.toLowerCase().endsWith(".epub")));
  const bestByBook = new Map<string, typeof links[number]>();
  for (const link of links) if (!bestByBook.has(link.book.id)) bestByBook.set(link.book.id, link);

  return {
    links: [...bestByBook.values()].map(({ book, file, score }) => ({
      candidateKey: `link:${book.id}:${file.name}`,
      candidateType: "link_file" as const,
      bookId: book.id,
      title: book.title,
      language: book.language,
      storageBucket: file.bucket_id || "book-ebooks",
      storagePath: file.name,
      confidence: score!.confidence,
      matchType: score!.matchType,
    })),
    duplicates: [...duplicateGroups.values()].filter((group) => group.length > 1).map((group) => ({
      candidateKey: `duplicate:${group.map((file) => file.name).sort().join("|")}`,
      candidateType: "duplicate_file" as const,
      storageBucket: group[0].bucket_id || "book-ebooks",
      storagePath: group[0].name,
      evidence: { files: group.map((file) => file.name).sort() },
    })),
  };
}
