let lastSyncedAt: Date | null = null;
let lastSyncCount = 0;

export function markCalendarSynced() {
  lastSyncedAt = new Date();
  lastSyncCount += 1;
}

export function getCalendarSyncStatus() {
  return { lastSyncedAt, lastSyncCount };
}
