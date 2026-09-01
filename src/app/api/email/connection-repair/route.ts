import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";
import {
  buildEmailConnectionHealthRepairPatch,
  resolveEmailConnectionRepairRequest,
} from "@/lib/email/connection-repair-policy";
import { decryptPassword } from "@/services/email/crypto";
import { checkImapConnection } from "@/services/email/imap-connection-check";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const policy = resolveEmailConnectionRepairRequest(body as Record<string, unknown>);
  if (!policy.ok) {
    return NextResponse.json({ error: policy.error }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: account, error: accountError } = await supabase
    .from("brand_email_configs")
    .select(
      "id,brand_id,email_address,imap_host,imap_port,imap_secure,encrypted_password,encryption_iv,is_active,auto_fetch"
    )
    .eq("id", policy.request.accountId)
    .maybeSingle();

  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Email account not found" }, { status: 404 });
  if (account.is_active === false) return NextResponse.json({ error: "Email account is inactive" }, { status: 409 });
  if (!account.imap_host || !account.encrypted_password || !account.encryption_iv) {
    return NextResponse.json(
      { error: "Email account is missing IMAP configuration or stored credentials" },
      { status: 409 }
    );
  }

  try {
    const password = decryptPassword(account.encrypted_password, account.encryption_iv);
    const result = await checkImapConnection({
      host: account.imap_host,
      port: account.imap_port || 993,
      secure: account.imap_secure !== false,
      email: account.email_address,
      password,
    });

    const now = new Date().toISOString();
    const patch = buildEmailConnectionHealthRepairPatch(now);
    const { error: updateError } = await supabase
      .from("brand_email_configs")
      .update(patch)
      .eq("id", account.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabase.from("automation_logs").insert({
      action: "email_connection_health_repair",
      agent_name: "nexus_communications",
      status: "success",
      details: {
        account_id: account.id,
        brand_id: account.brand_id,
        email_address: account.email_address,
        auto_fetch_preserved: true,
        auto_fetch: Boolean(account.auto_fetch),
        credentials_rotated: false,
        message_content_fetched: false,
      },
    });

    return NextResponse.json({
      success: true,
      accountId: account.id,
      brandId: account.brand_id,
      emailAddress: account.email_address,
      health: "healthy",
      autoFetch: Boolean(account.auto_fetch),
      autoFetchPreserved: true,
      connection: result,
      repairedAt: now,
      safety: {
        explicitConfirmationRequired: true,
        storedCredentialUsed: true,
        credentialsRotated: false,
        autoFetchPreserved: true,
        messageContentFetched: false,
        emailSent: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("automation_logs").insert({
      action: "email_connection_health_repair",
      agent_name: "nexus_communications",
      status: "failed",
      details: {
        account_id: account.id,
        brand_id: account.brand_id,
        email_address: account.email_address,
        error: message.slice(0, 300),
        health_changed: false,
        auto_fetch_changed: false,
        credentials_rotated: false,
      },
    });
    return NextResponse.json(
      { error: "Stored credential connection repair failed", detail: message.slice(0, 300) },
      { status: 422 }
    );
  }
}
