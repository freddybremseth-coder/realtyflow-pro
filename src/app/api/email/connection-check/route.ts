import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";
import { decryptPassword } from "@/services/email/crypto";
import { checkImapConnection } from "@/services/email/imap-connection-check";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  try {
    const body = await request.json().catch(() => ({}));
    const accountId = String(body?.accountId || "").trim();
    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: account, error } = await supabase
      .from("brand_email_configs")
      .select(
        "id, brand_id, email_address, imap_host, imap_port, imap_secure, encrypted_password, encryption_iv, is_active"
      )
      .eq("id", accountId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!account) {
      return NextResponse.json({ error: "Email account not found" }, { status: 404 });
    }
    if (account.is_active === false) {
      return NextResponse.json({ error: "Email account is inactive" }, { status: 409 });
    }
    if (!account.imap_host || !account.encrypted_password || !account.encryption_iv) {
      return NextResponse.json(
        { error: "Email account is missing IMAP configuration or stored credentials" },
        { status: 409 }
      );
    }

    const password = decryptPassword(account.encrypted_password, account.encryption_iv);
    const result = await checkImapConnection({
      host: account.imap_host,
      port: account.imap_port || 993,
      secure: account.imap_secure !== false,
      email: account.email_address,
      password,
    });

    return NextResponse.json({
      success: true,
      accountId: account.id,
      brandId: account.brand_id,
      emailAddress: account.email_address,
      ...result,
      checkedAt: new Date().toISOString(),
      safety: {
        mailboxReadOnly: true,
        messageContentFetched: false,
        databaseHealthUpdated: false,
        emailSent: false,
      },
    });
  } catch (error) {
    console.error("[Email Connection Check]", error);
    return NextResponse.json(
      {
        success: false,
        error: "IMAP connection check failed",
        detail: error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
      },
      { status: 422 }
    );
  }
}
