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

type Provider = keyof typeof PROVIDERS;

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const accountId = String(body?.accountId || "").trim();
  const provider = String(body?.provider || "").trim().toLowerCase() as Provider;
  const emailAddress = String(body?.emailAddress || "").trim().toLowerCase();
  const password = String(body?.password || "");

  if (!accountId) return NextResponse.json({ error: "accountId mangler" }, { status: 400 });
  if (!PROVIDERS[provider]) return NextResponse.json({ error: "Ukjent e-postprovider" }, { status: 400 });
  if (!emailAddress || !emailAddress.includes("@")) return NextResponse.json({ error: "Gyldig e-postadresse kreves" }, { status: 400 });
  if (!password || password.length < 4) return NextResponse.json({ error: "Passord/app-passord kreves" }, { status: 400 });

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

  const preset = PROVIDERS[provider];
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
      details: { account_id: accountId, brand_id: account.brand_id, provider, email_address: emailAddress, error: message },
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
    details: { account_id: accountId, brand_id: account.brand_id, provider, email_address: emailAddress },
  });

  return NextResponse.json({ success: true, accountId, brandId: account.brand_id, provider, emailAddress, health: "healthy" });
}
