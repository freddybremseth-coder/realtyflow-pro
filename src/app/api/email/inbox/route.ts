import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { insertRevenueEvent } from "@/lib/revenue/events";
import {
  buildEmailReceivedRevenueEventInput,
  normalizeEmailAddresses,
} from "@/lib/revenue/email-events";
import { fetchRecentEmails, type ImapConfig } from "@/services/email/imap-reader";
import { decryptPassword } from "@/services/email/crypto";

/**
 * GET /api/email/inbox
 * Fetch emails for a brand from Supabase.
 * Query params: brand_id, limit, offset, unread_only, intent, urgency
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brand_id");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const unreadOnly = searchParams.get("unread_only") === "true";
    const intent = searchParams.get("intent");
    const urgency = searchParams.get("urgency");
    const archived = searchParams.get("archived") === "true";

    const supabase = createServerClient();

    let query = supabase
      .from("email_messages")
      .select("*")
      .eq("is_archived", archived)
      .order("received_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (brandId) {
      query = query.eq("brand_id", brandId);
    }
    if (unreadOnly) {
      query = query.eq("is_read", false);
    }
    if (intent) {
      query = query.eq("ai_intent", intent);
    }
    if (urgency) {
      query = query.eq("ai_urgency", urgency);
    }

    const { data: messages, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    // Get unread counts per brand
    const { data: unreadCounts } = await supabase
      .from("email_messages")
      .select("brand_id")
      .eq("is_read", false)
      .eq("is_archived", false);

    const brandUnreadMap: Record<string, number> = {};
    for (const msg of unreadCounts || []) {
      brandUnreadMap[msg.brand_id] = (brandUnreadMap[msg.brand_id] || 0) + 1;
    }

    return NextResponse.json({
      messages: messages || [],
      total: count ?? messages?.length ?? 0,
      unread_by_brand: brandUnreadMap,
    });
  } catch (error) {
    console.error("[Email Inbox GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/email/inbox
 * Trigger email fetch from IMAP for a brand and store new messages.
 * Body: { brand_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { brand_id } = await req.json();

    if (!brand_id) {
      return NextResponse.json(
        { error: "brand_id is required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get all brand email configs (may have multiple accounts per brand)
    const { data: configs, error: configError } = await supabase
      .from("brand_email_configs")
      .select("*")
      .eq("brand_id", brand_id)
      .eq("is_active", true);

    if (configError || !configs || configs.length === 0) {
      return NextResponse.json(
        { error: "No active email config found for this brand" },
        { status: 404 }
      );
    }

    // Get existing message IDs to avoid duplicates
    const { data: existingMessages } = await supabase
      .from("email_messages")
      .select("message_id")
      .eq("brand_id", brand_id);

    const existingIds = new Set(
      (existingMessages || []).map((m) => m.message_id)
    );

    let totalFetched = 0;
    let totalInserted = 0;
    const accountResults: { email: string; fetched: number; new_messages: number; error?: string }[] = [];

    // Process each email account for this brand
    for (const config of configs) {
      try {
        // Decrypt password
        const password = decryptPassword(config.encrypted_password, config.encryption_iv);

        const imapConfig: ImapConfig = {
          host: config.imap_host,
          port: config.imap_port,
          secure: config.imap_secure,
          email: config.email_address,
          password,
        };

        // Determine fetch window
        const sinceDays = config.last_fetched_at
          ? Math.max(
              1,
              Math.ceil(
                (Date.now() - new Date(config.last_fetched_at).getTime()) /
                  (1000 * 60 * 60 * 24)
              )
            )
          : 7;

        // Fetch from IMAP
        const fetchedEmails = await fetchRecentEmails(imapConfig, 100, sinceDays);

        // Filter new emails
        const newEmails = fetchedEmails.filter(
          (e) => e.messageId && !existingIds.has(e.messageId)
        );

        // Insert new emails
        let insertedCount = 0;
        for (const email of newEmails) {
          const { data: insertedMessage, error: insertError } = await supabase
            .from("email_messages")
            .insert({
              brand_id,
              message_id: email.messageId,
              thread_id: email.threadId || email.messageId,
              direction: "inbound",
              from_address: email.from.address,
              from_name: email.from.name || null,
              to_addresses: email.to.map((t) => t.address),
              cc_addresses: email.cc?.map((c) => c.address) || null,
              subject: email.subject,
              body_text: email.bodyText || null,
              body_html: email.bodyHtml || null,
              received_at: email.date.toISOString(),
            })
            .select("id")
            .single();

          if (!insertError) {
            insertedCount++;
            existingIds.add(email.messageId); // prevent cross-account duplicates

            const normalizedFrom = normalizeEmailAddresses([email.from.address])[0];
            const { data: contact, error: contactError } = normalizedFrom
              ? await supabase
                  .from("contacts")
                  .select("id, email, brand_id")
                  .eq("brand_id", brand_id)
                  .ilike("email", normalizedFrom)
                  .order("updated_at", { ascending: false })
                  .limit(1)
                  .maybeSingle()
              : { data: null, error: null };

            if (contactError) {
              console.warn("[Email Inbox] contact lookup for revenue event failed", contactError.message);
            }

            const eventResult = await insertRevenueEvent(supabase, buildEmailReceivedRevenueEventInput({
              brandId: brand_id,
              fromAddress: email.from.address,
              fromName: email.from.name || null,
              toAddresses: email.to.map((t) => t.address),
              subject: email.subject,
              bodyPreview: (email.bodyText || "").slice(0, 280),
              receivedAt: email.date.toISOString(),
              messageId: email.messageId,
              threadId: email.threadId || email.messageId,
              storedEmailMessageId: insertedMessage?.id || null,
              contactId: contact?.id || null,
            }));

            if (!eventResult.ok && !eventResult.tableNotReady) {
              console.warn("[Email Inbox] revenue event insert failed", eventResult.error);
            }
          }
        }

        // Update last_fetched_at
        await supabase
          .from("brand_email_configs")
          .update({ last_fetched_at: new Date().toISOString() })
          .eq("id", config.id);

        totalFetched += fetchedEmails.length;
        totalInserted += insertedCount;
        accountResults.push({ email: config.email_address, fetched: fetchedEmails.length, new_messages: insertedCount });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[Email Inbox] Failed to fetch ${config.email_address}:`, msg);
        accountResults.push({ email: config.email_address, fetched: 0, new_messages: 0, error: msg });
      }
    }

    return NextResponse.json({
      success: true,
      fetched: totalFetched,
      new_messages: totalInserted,
      accounts: accountResults,
    });
  } catch (error) {
    console.error("[Email Inbox POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
