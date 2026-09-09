import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { encryptPassword } from "@/services/email/crypto";
import { checkImapConnection } from "@/services/email/imap-connection-check";
import type { ImapConfig } from "@/services/email/imap-reader";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PROVIDERS = {
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

type Provider = keyof typeof PROVIDERS | "custom";

type MailPreset = {
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

function buildPreset(provider: Provider, body: Record<string, unknown>): MailPreset | null {
  if (provider !== "custom") return PROVIDERS[provider] ?? null;

  const imapHost = String(body.imapHost || "").trim();
  const smtpHost = String(body.smtpHost || "").trim();
  const imapPort = asPort(body.imapPort, 993);
  const smtpPort = asPort(body.smtpPort, 465);
  const imapSecure = asBool(body.imapSecure, true);
  const smtpSecure = asBool(body.smtpSecure, true);

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

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const accountId = String(body.accountId || "").trim();
  const provider = String(body.provider || "").trim().toLowerCase() as Provider;
  const emailAddress = String(body.emailAddress || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!accountId) return NextResponse.json({ error: "accountId mangler" }, { status: 400 });
  if (!emailAddress || !emailAddress.includes("@")) {
    return NextResponse.json({ error: "Gyldig e-postadresse kreves" }, { status: 400 });
  }
  if (!password || password.length < 4) {
    return NextResponse.json({ error: "Passord/app-passord kreves" }, { status: 400 });
  }

  const preset = buildPreset(provider, body);
  if (!preset) {
    return NextResponse.json(
      {
        error:
          provider === "custom"
            ? "Custom provider krever gyldig IMAP-host, IMAP-port, SMTP-host og SMTP-port"
            : "Ukjent e-postprovider",
      },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: account, error: accountError } = await supabase
    .from("brand_email_configs")
    .select("id,brand_id,email_address")
    .eq("id", accountId)
    .eq("is_active", true)
    .maybeSingle();
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "E-postkonto ikke funnet" }, { status: 404 });

  const imap: ImapConfig = {
    host: preset.imap_host,
    port: preset.imap_port,
    secure: preset.imap_secure,
    email: emailAddress,
    password,
  };

  try {
    await checkImapConnection(imap);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("automation_logs").insert({
      action: "email_reconnect_test",
      agent_name: "nexus_communications",
      status: "failed",
      details: {
        account_id: accountId,
        brand_id: account.brand_id,
        provider,
        email_address: emailAddress,
        imap_host: preset.imap_host,
        imap_port: preset.imap_port,
        error: message,
      },
    });
    return NextResponse.json({ error: `Tilkobling feilet: ${message}` }, { status: 422 });
  }

  const encrypted = encryptPassword(password);
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("brand_email_configs")
    .update({
      email_address: emailAddress,
      ...preset,
      encrypted_password: encrypted.encrypted,
      encryption_iv: encrypted.iv,
      auto_fetch: true,
      auto_fetch_paused_by_system: false,
      health_status: "healthy",
      health_message: null,
      consecutive_failures: 0,
      last_error_at: null,
      last_success_at: now,
      updated_at: now,
    })
    .eq("id", accountId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabase.from("automation_logs").insert({
    action: "email_reconnect",
    agent_name: "nexus_communications",
    status: "success",
    details: {
      account_id: accountId,
      brand_id: account.brand_id,
      provider,
      email_address: emailAddress,
      imap_host: preset.imap_host,
      smtp_host: preset.smtp_host,
    },
  });

  return NextResponse.json({
    success: true,
    accountId,
    brandId: account.brand_id,
    provider,
    emailAddress,
    health: "healthy",
    config: {
      imapHost: preset.imap_host,
      imapPort: preset.imap_port,
      imapSecure: preset.imap_secure,
      smtpHost: preset.smtp_host,
      smtpPort: preset.smtp_port,
      smtpSecure: preset.smtp_secure,
    },
  });
}
