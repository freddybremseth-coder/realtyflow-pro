import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { encryptPassword } from "@/services/email/crypto";

/**
 * GET /api/email/config
 * List email configs for brands (without passwords).
 * Query params: brand_id (optional)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brand_id");

    const supabase = createServerClient();

    let query = supabase
      .from("brand_email_configs")
      .select(
        "id, brand_id, email_address, display_name, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, auto_fetch, fetch_interval_minutes, ai_auto_draft, signature, is_active, last_fetched_at, created_at, updated_at"
      )
      .order("created_at", { ascending: false });

    if (brandId) {
      query = query.eq("brand_id", brandId);
    }

    const { data: configs, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ configs: configs || [] });
  } catch (error) {
    console.error("[Email Config GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/email/config
 * Create or update email config (encrypt password).
 * Body: { brand_id, email_address, display_name, imap_host, imap_port, imap_secure,
 *         smtp_host, smtp_port, smtp_secure, password, auto_fetch, fetch_interval_minutes,
 *         ai_auto_draft, signature, id? (for update) }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createServerClient();

    const {
      id,
      brand_id,
      email_address,
      display_name,
      imap_host,
      imap_port = 993,
      imap_secure = true,
      smtp_host,
      smtp_port = 587,
      smtp_secure = true,
      password,
      auto_fetch = true,
      fetch_interval_minutes = 5,
      ai_auto_draft = true,
      signature,
    } = body;

    if (!brand_id || !email_address) {
      return NextResponse.json(
        { error: "brand_id and email_address are required" },
        { status: 400 }
      );
    }

    if (id) {
      // Update existing config
      const updateData: Record<string, unknown> = {
        email_address,
        display_name: display_name || null,
        imap_host,
        imap_port,
        imap_secure,
        smtp_host,
        smtp_port,
        smtp_secure,
        auto_fetch,
        fetch_interval_minutes,
        ai_auto_draft,
        signature: signature || null,
      };

      // Only update password if a new one is provided
      if (password) {
        const { encrypted, iv } = encryptPassword(password);
        updateData.encrypted_password = encrypted;
        updateData.encryption_iv = iv;
      }

      const { data: config, error } = await supabase
        .from("brand_email_configs")
        .update(updateData)
        .eq("id", id)
        .select(
          "id, brand_id, email_address, display_name, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, auto_fetch, fetch_interval_minutes, ai_auto_draft, signature, is_active, created_at, updated_at"
        )
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({ success: true, config });
    } else {
      // Create new config
      if (!password || !imap_host || !smtp_host) {
        return NextResponse.json(
          { error: "password, imap_host, and smtp_host are required for new configs" },
          { status: 400 }
        );
      }

      const { encrypted, iv } = encryptPassword(password);

      const { data: config, error } = await supabase
        .from("brand_email_configs")
        .insert({
          brand_id,
          email_address,
          display_name: display_name || null,
          imap_host,
          imap_port,
          imap_secure,
          smtp_host,
          smtp_port,
          smtp_secure,
          encrypted_password: encrypted,
          encryption_iv: iv,
          auto_fetch,
          fetch_interval_minutes,
          ai_auto_draft,
          signature: signature || null,
        })
        .select(
          "id, brand_id, email_address, display_name, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, auto_fetch, fetch_interval_minutes, ai_auto_draft, signature, is_active, created_at, updated_at"
        )
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({ success: true, config });
    }
  } catch (error) {
    console.error("[Email Config POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/email/config
 * Remove email config.
 * Query params: id
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { error } = await supabase
      .from("brand_email_configs")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Email Config DELETE]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
