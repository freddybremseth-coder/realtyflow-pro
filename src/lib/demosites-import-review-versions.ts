export type ImportReviewRecord = Record<string, unknown>;

export type ImportReviewSnapshot = {
  profile: ImportReviewRecord;
  editable_fields: ImportReviewRecord;
  warnings: string[];
};

export type ImportReviewVersion = ImportReviewSnapshot & {
  id: string;
  saved_at: string;
  label: string;
  changed_fields: string[];
};

export type VersionedImportReviewResult = {
  editable_fields: ImportReviewRecord;
  versions: ImportReviewVersion[];
  didAppendVersion: boolean;
};

export const IMPORT_REVIEW_VERSIONS_KEY = "import_review_versions";
export const MAX_IMPORT_REVIEW_VERSIONS = 10;

const MAX_VERSION_ARRAY_ITEMS = 30;
const MAX_VERSION_OBJECT_KEYS = 80;
const MAX_VERSION_STRING_LENGTH = 5000;
const MAX_VERSION_WARNINGS = 20;
const MAX_CHANGED_FIELDS = 20;
const MAX_EDITABLE_FIELDS_JSON_LENGTH = 250_000;

function isPlainRecord(value: unknown): value is ImportReviewRecord {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeString(value: unknown, maxLength = MAX_VERSION_STRING_LENGTH) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLength);
}

function normalizeStringArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item, 500)).filter(Boolean).slice(0, maxItems);
}

function sanitizeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, MAX_VERSION_STRING_LENGTH);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_VERSION_ARRAY_ITEMS)
      .map((item) => sanitizeJsonValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (isPlainRecord(value)) {
    const output: ImportReviewRecord = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_VERSION_OBJECT_KEYS)) {
      const sanitized = sanitizeJsonValue(item, depth + 1);
      if (sanitized !== undefined) output[key] = sanitized;
    }
    return output;
  }
  return undefined;
}

function sanitizeRecord(value: unknown): ImportReviewRecord {
  if (!isPlainRecord(value)) return {};
  const sanitized = sanitizeJsonValue(value);
  return isPlainRecord(sanitized) ? sanitized : {};
}

export function withoutImportReviewVersions(fields: unknown): ImportReviewRecord {
  if (!isPlainRecord(fields)) return {};
  const output: ImportReviewRecord = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === IMPORT_REVIEW_VERSIONS_KEY) continue;
    const sanitized = sanitizeJsonValue(value);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

export function createImportReviewSnapshot(input: {
  profile?: unknown;
  editable_fields?: unknown;
  warnings?: unknown;
}): ImportReviewSnapshot {
  return {
    profile: sanitizeRecord(input.profile),
    editable_fields: withoutImportReviewVersions(input.editable_fields),
    warnings: normalizeStringArray(input.warnings, MAX_VERSION_WARNINGS),
  };
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (!isPlainRecord(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce<ImportReviewRecord>((output, key) => {
      output[key] = sortForStableJson(value[key]);
      return output;
    }, {});
}

function stableStringify(value: unknown) {
  return JSON.stringify(sortForStableJson(value));
}

function snapshotKey(snapshot: ImportReviewSnapshot) {
  return stableStringify(snapshot);
}

function normalizeVersion(value: unknown, index: number): ImportReviewVersion | null {
  if (!isPlainRecord(value)) return null;
  const savedAt = normalizeString(value.saved_at, 80);
  const fallbackId = savedAt ? `review-${savedAt.replace(/[^0-9a-z]/gi, "")}-${index + 1}` : `review-version-${index + 1}`;
  return {
    id: normalizeString(value.id, 120) || fallbackId,
    saved_at: savedAt,
    label: normalizeString(value.label, 120) || `Lagret versjon ${index + 1}`,
    profile: sanitizeRecord(value.profile),
    editable_fields: withoutImportReviewVersions(value.editable_fields),
    warnings: normalizeStringArray(value.warnings, MAX_VERSION_WARNINGS),
    changed_fields: normalizeStringArray(value.changed_fields, MAX_CHANGED_FIELDS),
  };
}

export function getImportReviewVersions(fields: unknown): ImportReviewVersion[] {
  if (!isPlainRecord(fields) || !Array.isArray(fields[IMPORT_REVIEW_VERSIONS_KEY])) return [];
  return fields[IMPORT_REVIEW_VERSIONS_KEY]
    .map((version, index) => normalizeVersion(version, index))
    .filter((version): version is ImportReviewVersion => Boolean(version))
    .slice(0, MAX_IMPORT_REVIEW_VERSIONS);
}

function changedTopLevelFields(previous: ImportReviewSnapshot, current: ImportReviewSnapshot) {
  const changes: string[] = [];
  const sections: Array<keyof ImportReviewSnapshot> = ["profile", "editable_fields", "warnings"];

  for (const section of sections) {
    if (section === "warnings") {
      if (stableStringify(previous.warnings) !== stableStringify(current.warnings)) changes.push("warnings");
      continue;
    }

    const previousSection = previous[section];
    const currentSection = current[section];
    const keys = new Set([...Object.keys(previousSection), ...Object.keys(currentSection)]);
    keys.delete(IMPORT_REVIEW_VERSIONS_KEY);
    for (const key of keys) {
      if (stableStringify(previousSection[key]) !== stableStringify(currentSection[key])) {
        changes.push(key);
      }
      if (changes.length >= MAX_CHANGED_FIELDS) return changes;
    }
  }

  return changes;
}

function versionIdentity(version: ImportReviewVersion) {
  return snapshotKey({
    profile: version.profile,
    editable_fields: version.editable_fields,
    warnings: version.warnings,
  });
}

function withVersions(editableFields: ImportReviewRecord, versions: ImportReviewVersion[]) {
  return versions.length
    ? { ...editableFields, [IMPORT_REVIEW_VERSIONS_KEY]: versions }
    : { ...editableFields };
}

export function buildVersionedImportReviewEditableFields(input: {
  current: { profile?: unknown; editable_fields?: unknown; warnings?: unknown };
  previous?: { profile?: unknown; editable_fields?: unknown; warnings?: unknown } | null;
  now?: Date;
}): VersionedImportReviewResult {
  const currentSnapshot = createImportReviewSnapshot(input.current);
  const previousSnapshot = input.previous ? createImportReviewSnapshot(input.previous) : null;
  const existingVersions = getImportReviewVersions(input.current.editable_fields);
  let versions = existingVersions;
  let didAppendVersion = false;

  if (previousSnapshot && snapshotKey(previousSnapshot) !== snapshotKey(currentSnapshot)) {
    const previousIdentity = snapshotKey(previousSnapshot);
    const alreadyStored = existingVersions.some((version) => versionIdentity(version) === previousIdentity);
    if (!alreadyStored) {
      const savedAt = (input.now || new Date()).toISOString();
      const version: ImportReviewVersion = {
        id: `review-${savedAt.replace(/[^0-9a-z]/gi, "")}-${existingVersions.length + 1}`,
        saved_at: savedAt,
        label: `Lagret versjon ${existingVersions.length + 1}`,
        profile: previousSnapshot.profile,
        editable_fields: previousSnapshot.editable_fields,
        warnings: previousSnapshot.warnings,
        changed_fields: changedTopLevelFields(previousSnapshot, currentSnapshot),
      };
      versions = [version, ...existingVersions].slice(0, MAX_IMPORT_REVIEW_VERSIONS);
      didAppendVersion = true;
    }
  }

  return {
    editable_fields: withVersions(currentSnapshot.editable_fields, versions),
    versions,
    didAppendVersion,
  };
}

export function sanitizeImportReviewEditableFieldsForStorage(value: unknown): {
  value?: ImportReviewRecord;
  error?: string;
} {
  if (!isPlainRecord(value)) return { error: "editable_fields must be an object" };
  const base = withoutImportReviewVersions(value);
  const versions = getImportReviewVersions(value);
  const output = withVersions(base, versions);
  const serialized = JSON.stringify(output);
  if (serialized.length > MAX_EDITABLE_FIELDS_JSON_LENGTH) {
    return { error: "editable_fields payload is too large" };
  }
  return { value: output };
}
