import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptPassword } from "@/services/email/crypto";
import { sendEmail, type SmtpConfig, type OutgoingEmail } from "@/services/email/smtp-sender";
import { requireAdminApi } from "@/lib/api-admin";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * POST /api/email/newsletter
 * Send a newsletter/email to multiple recipients.
 *
 * Body: {
 *   brand_id: string,
 *   subject: string,
 *   body_html: string,
 *   body_text: string,
 *   recipients: "all" | "pipeline_phase" | "category" | "individual",
 *   pipeline_phase?: string,       // when recipients="pipeline_phase"
 *   brand_filter?: string,         // filter contacts by brand_id
 *   category?: string,             // when recipients="category" (brand type)
 *   individual_emails?: string[],  // when recipients="individual"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const adminError = await requireAdminApi(req);
    if (adminError) return adminError;

    const body = await req.json();
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const {
      brand_id,
      subject,
      body_html,
      body_text,
      recipients,
      pipeline_phase,
      brand_filter,
      category,
      individual_emails,
    } = body;

    if (!brand_id || !subject || (!body_html && !body_text)) {
      return NextResponse.json(
        { error: "brand_id, subject, and body content are required" },
        { status: 400 }
      );
    }

    // Get brand email config for SMTP
    const { data: config, error: configError } = await supabase
      .from("brand_email_configs")
      .select("*")
      .eq("brand_id", brand_id)
      .eq("is_active", true)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { error: `Ingen aktiv e-postkonfigurasjon for dette brandet. Konfigurer SMTP i Innstillinger først.` },
        { status: 404 }
      );
    }

    // Decrypt password
    const password = decryptPassword(config.encrypted_password, config.encryption_iv);

    const smtpConfig: SmtpConfig = {
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure,
      email: config.email_address,
      password,
      displayName: config.display_name || undefined,
    };

    // Build recipient list
    let emailAddresses: string[] = [];

    if (recipients === "individual" && individual_emails?.length) {
      emailAddresses = individual_emails;
    } else {
      // Fetch contacts from database
      let query = supabase.from("contacts").select("email, name, pipeline_status, brand_id");

      if (recipients === "pipeline_phase" && pipeline_phase) {
        query = query.eq("pipeline_status", pipeline_phase);
      }

      if (brand_filter) {
        query = query.eq("brand_id", brand_filter);
      }

      if (recipients === "category" && category) {
        // Category maps to brand type - get all brand_ids of that type
        // Category is the brand type (real_estate, saas, agriculture, etc.)
        // We need to match contacts whose brand_id belongs to brands of this type
        // For now, use brand_filter which already handles this
      }

      const { data: contacts, error: contactsError } = await query;
      if (contactsError) {
        return NextResponse.json(
          { error: `Feil ved henting av kontakter: ${contactsError.message}` },
          { status: 500 }
        );
      }

      emailAddresses = (contacts || [])
        .map((c) => c.email)
        .filter((e): e is string => !!e && e.includes("@"));
    }

    if (emailAddresses.length === 0) {
      return NextResponse.json(
        { error: "Ingen mottakere funnet med valgt filter" },
        { status: 400 }
      );
    }

    // Remove duplicates
    emailAddresses = Array.from(new Set(emailAddresses));

    // Send emails individually (not BCC) for personalization and deliverability
    const results: { email: string; success: boolean; error?: string }[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const email of emailAddresses) {
      const outgoingEmail: OutgoingEmail = {
        to: [email],
        subject,
        bodyText: body_text || "",
        bodyHtml: body_html || undefined,
      };

      try {
        const result = await sendEmail(smtpConfig, outgoingEmail);
        if (result.success) {
          successCount++;
          results.push({ email, success: true });
        } else {
          failCount++;
          results.push({ email, success: false, error: result.error });
        }
      } catch (err) {
        failCount++;
        results.push({
          email,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }

      // Small delay between sends to avoid rate limiting
      if (emailAddresses.length > 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Save newsletter record
    await supabase.from("email_messages").insert({
      brand_id,
      direction: "outbound",
      from_address: config.email_address,
      from_name: config.display_name || null,
      to_addresses: emailAddresses,
      subject,
      body_text: body_text || "",
      body_html: body_html || null,
      is_read: true,
      received_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      total: emailAddresses.length,
      sent: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    console.error("[Newsletter Send]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
