export const EMAIL_PROVIDER_PRESETS = {
  hostinger: {
    imap_host: "imap.hostinger.com",
    imap_port: 993,
    imap_secure: true,
    smtp_host: "smtp.hostinger.com",
    smtp_port: 465,
    smtp_secure: true,
  },
  gmail: {
    imap_host: "imap.gmail.com",
    imap_port: 993,
    imap_secure: true,
    smtp_host: "smtp.gmail.com",
    smtp_port: 465,
    smtp_secure: true,
  },
} as const;

export type EmailProvider = keyof typeof EMAIL_PROVIDER_PRESETS | "custom";

export type MailProviderConfig = {
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
};

function asPort(value: unknown, fallback?: number) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) return parsed;
  return fallback ?? 0;
}

function asBool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
    if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

export function buildEmailProviderConfig(
  provider: EmailProvider,
  input: Record<string, unknown>,
): MailProviderConfig | null {
  if (provider !== "custom") return EMAIL_PROVIDER_PRESETS[provider] ?? null;

  const imapHost = String(input.imapHost || "").trim();
  const smtpHost = String(input.smtpHost || "").trim();
  const imapPort = asPort(input.imapPort, 993);
  const smtpPort = asPort(input.smtpPort, 465);
  const imapSecure = asBool(input.imapSecure, true);
  const smtpSecure = asBool(input.smtpSecure, true);

  if (!imapHost || !smtpHost || !imapPort || !smtpPort) return null;

  return {
    imap_host: imapHost,
    imap_port: imapPort,
    imap_secure: imapSecure,
    smtp_host: smtpHost,
    smtp_port: smtpPort,
    smtp_secure: smtpSecure,
  };
}
