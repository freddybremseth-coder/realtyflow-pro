type ImapErrorLike = {
  message?: unknown;
  code?: unknown;
  response?: unknown;
  responseText?: unknown;
  responseStatus?: unknown;
  serverResponseCode?: unknown;
  command?: unknown;
  path?: unknown;
  // Legacy ImapFlow fields kept for older runtime errors.
  responseCode?: unknown;
  executedCommand?: unknown;
  authenticationFailed?: unknown;
  cause?: unknown;
};

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function errorLike(error: unknown): ImapErrorLike {
  if (error && typeof error === "object") return error as ImapErrorLike;
  return { message: error };
}

export function describeImapError(error: unknown) {
  const source = errorLike(error);
  const cause = errorLike(source.cause);
  const parts = [
    text(source.message),
    text(source.code),
    text(source.responseStatus),
    text(source.serverResponseCode),
    text(source.responseCode),
    text(source.responseText),
    text(source.response),
    text(source.command),
    text(source.executedCommand),
    text(source.path),
    text(cause.message),
    text(cause.code),
  ].filter(Boolean);

  const unique = Array.from(new Set(parts));
  return (unique.join(" | ") || "Unknown IMAP error").slice(0, 500);
}

export function isPermanentImapError(error: unknown) {
  const source = errorLike(error);
  if (source.authenticationFailed === true) return true;

  const details = describeImapError(error);
  return /authenticationfailed|authentication failed|invalid (?:credentials|password)|bad credentials|wrong password|login failed|not authenticated|account (?:disabled|suspended|locked)|mailbox (?:disabled|suspended)|user(?:name)? .*not found/i.test(details);
}

export function isTransientImapError(error: unknown) {
  if (isPermanentImapError(error)) return false;

  const details = describeImapError(error);
  return /connection not available|not connected|connection closed|socket.*closed|econnreset|etimedout|econnrefused|timeout|temporar|upstream|server busy|try again|rate limit|too many connections|unavailable/i.test(details);
}
