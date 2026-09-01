export const EMAIL_HISTORY_BACKFILL_PREVIEW_COOKIE = "rf_email_backfill_preview";
export const EMAIL_HISTORY_BACKFILL_PREVIEW_COOKIE_MAX_AGE_SECONDS = 15 * 60;

export function buildEmailHistoryBackfillPreviewCookieValue(brandId: string, fingerprint: string) {
  return `${encodeURIComponent(brandId)}.${fingerprint}`;
}

export function readEmailHistoryBackfillPreviewCookieValue(value: string | undefined, brandId: string) {
  if (!value) return null;
  const separator = value.indexOf(".");
  if (separator <= 0) return null;

  const encodedBrand = value.slice(0, separator);
  const fingerprint = value.slice(separator + 1);
  let cookieBrand = "";
  try {
    cookieBrand = decodeURIComponent(encodedBrand);
  } catch {
    return null;
  }

  if (cookieBrand !== brandId) return null;
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) return null;
  return fingerprint;
}
