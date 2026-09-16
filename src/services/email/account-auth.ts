import { OAuth2Client } from "google-auth-library";

import { getChannelsByBrand, getDecryptedTokens } from "@/lib/oauth/channels";
import { getGoogleCredentials } from "@/lib/oauth/providers";
import { decryptPassword } from "@/services/email/crypto";
import type { ImapConfig } from "@/services/email/imap-reader";
import type { SmtpConfig } from "@/services/email/smtp-sender";

export const GOOGLE_MAIL_SCOPE = "https://mail.google.com/";

export type StoredEmailAccountConfig = {
  id?: string;
  brand_id: string;
  email_address: string;
  display_name?: string | null;
  imap_host: string;
  imap_port?: number | null;
  imap_secure?: boolean | null;
  smtp_host: string;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
  encrypted_password?: string | null;
  encryption_iv?: string | null;
};

export type ResolvedEmailAuth =
  | { method: "google_oauth"; accessToken: string }
  | { method: "password"; password: string };

function normalized(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function isGoogleMailbox(config: StoredEmailAccountConfig) {
  return normalized(config.imap_host) === "imap.gmail.com" || normalized(config.smtp_host) === "smtp.gmail.com";
}

async function resolveGoogleOAuth(config: StoredEmailAccountConfig): Promise<ResolvedEmailAuth | null> {
  if (!isGoogleMailbox(config)) return null;

  const email = normalized(config.email_address);
  const channels = await getChannelsByBrand(config.brand_id, "gmail");
  const channel = channels.find((row) => normalized(row.external_id) === email);
  if (!channel) return null;

  const tokens = await getDecryptedTokens(channel.id);
  if (!tokens?.refreshToken) {
    throw new Error(`Google OAuth for ${config.email_address} mangler refresh token. Koble kontoen til Google på nytt.`);
  }
  if (!tokens.scopes.includes(GOOGLE_MAIL_SCOPE)) {
    throw new Error(`Google OAuth for ${config.email_address} mangler Gmail IMAP/SMTP-tilgang. Koble kontoen til Google på nytt.`);
  }

  if (tokens.accessToken && tokens.expiresAt && tokens.expiresAt.getTime() > Date.now() + 90_000) {
    return { method: "google_oauth", accessToken: tokens.accessToken };
  }

  const credentials = getGoogleCredentials(config.brand_id);
  const auth = new OAuth2Client(credentials.clientId, credentials.clientSecret);
  auth.setCredentials({ refresh_token: tokens.refreshToken });
  const result = await auth.getAccessToken();
  const accessToken = typeof result === "string" ? result : result?.token;
  if (!accessToken) {
    throw new Error(`Google klarte ikke å fornye tilgang for ${config.email_address}. Koble kontoen til Google på nytt.`);
  }

  return { method: "google_oauth", accessToken };
}

export async function resolveEmailAccountAuth(config: StoredEmailAccountConfig): Promise<ResolvedEmailAuth> {
  const googleAuth = await resolveGoogleOAuth(config);
  if (googleAuth) return googleAuth;

  if (!config.encrypted_password || !config.encryption_iv) {
    if (isGoogleMailbox(config)) {
      throw new Error(`Ingen Google OAuth-tilkobling finnes for ${config.email_address}. Bruk «Logg inn med Google».`);
    }
    throw new Error(`Ingen lagret e-postcredential finnes for ${config.email_address}.`);
  }

  return {
    method: "password",
    password: decryptPassword(config.encrypted_password, config.encryption_iv),
  };
}

export async function buildImapConfigFromAccount(config: StoredEmailAccountConfig): Promise<ImapConfig> {
  const auth = await resolveEmailAccountAuth(config);
  return {
    host: config.imap_host,
    port: config.imap_port || 993,
    secure: config.imap_secure !== false,
    email: config.email_address,
    ...(auth.method === "google_oauth"
      ? { accessToken: auth.accessToken }
      : { password: auth.password }),
  };
}

export async function buildSmtpConfigFromAccount(
  config: StoredEmailAccountConfig,
  displayName?: string,
): Promise<SmtpConfig> {
  const auth = await resolveEmailAccountAuth(config);
  return {
    host: config.smtp_host,
    port: config.smtp_port || 465,
    secure: config.smtp_secure !== false,
    email: config.email_address,
    displayName: displayName || config.display_name || undefined,
    ...(auth.method === "google_oauth"
      ? { accessToken: auth.accessToken }
      : { password: auth.password }),
  };
}
