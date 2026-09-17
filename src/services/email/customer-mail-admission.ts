import type { SupabaseClient } from "@supabase/supabase-js";
import type { FetchedEmail, HistoricalMailboxRole } from "@/services/email/imap-reader";
import { classifyInboundMailSource } from "@/services/email/inbound-mail-filter";

export type CustomerMailAdmissionStatus = "accept" | "review" | "filtered";

type ContactIdentity = { id: string; brandId: string };
export type CustomerMailContactIndex = Map<string, ContactIdentity[]>;

export type CustomerMailAdmissionMessage = FetchedEmail & {
  mailboxRole: HistoricalMailboxRole;
};

export type CustomerMailAdmissionDecision = {
  status: CustomerMailAdmissionStatus;
  reason: string;
  contactId: string | null;
};

const VENDOR_OUTREACH_PATTERNS = [
  /\bcollaboration\b/i,
  /\bpartnership\b/i,
  /\bguest post\b/i,
  /\bseo services?\b/i,
  /\bmarketing services?\b/i,
  /\blead generation\b/i,
  /\binstagram followers?\b/i,
  /\bfurniture (?:solutions?|customization)\b/i,
  /\bfast-track your villa furniture\b/i,
  /\bunified furniture solutions\b/i,
];

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function domainOf(value: unknown) {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function brandMatches(index: CustomerMailContactIndex, email: string, brandId: string) {
  return (index.get(normalizeEmail(email)) || []).filter((item) => item.brandId === brandId);
}

function resolveRecipientContacts(
  index: CustomerMailContactIndex,
  brandId: string,
  addresses: Array<{ address: string }>,
) {
  const ids = new Set<string>();
  let ambiguous = false;
  for (const address of addresses) {
    const matches = brandMatches(index, address.address, brandId);
    if (matches.length === 1) ids.add(matches[0].id);
    else if (matches.length > 1) ambiguous = true;
  }
  return { ids: [...ids], ambiguous };
}

export async function loadCustomerMailContactIndex(supabase: SupabaseClient) {
  const index: CustomerMailContactIndex = new Map();
  const pageSize = 1000;
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id,email,brand_id")
      .not("email", "is", null)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Customer-mail contact index failed: ${error.message}`);
    for (const row of data || []) {
      const email = normalizeEmail(row.email);
      if (!email) continue;
      const current = index.get(email) || [];
      current.push({ id: String(row.id), brandId: String(row.brand_id || "") });
      index.set(email, current);
    }
    if ((data || []).length < pageSize) break;
  }
  return index;
}

async function resolveThreadContactIds(
  supabase: SupabaseClient,
  brandId: string,
  message: CustomerMailAdmissionMessage,
  contactIndex: CustomerMailContactIndex,
) {
  const refs = unique([
    message.inReplyTo,
    message.threadId,
    ...(message.references || []),
  ].map((value) => String(value || "").trim()).filter(Boolean)).slice(0, 5);

  const contactIds = new Set<string>();
  for (const ref of refs) {
    for (const field of ["message_id", "thread_id"] as const) {
      const { data, error } = await supabase
        .from("email_messages")
        .select("crm_contact_id,direction,to_addresses,cc_addresses")
        .eq("brand_id", brandId)
        .eq(field, ref)
        .limit(10);
      if (error) throw new Error(`Customer-mail thread lookup failed: ${error.message}`);
      for (const row of data || []) {
        if (row.crm_contact_id) {
          contactIds.add(String(row.crm_contact_id));
          continue;
        }
        if (String(row.direction) !== "outbound") continue;
        const addresses = [
          ...((row.to_addresses || []) as string[]),
          ...((row.cc_addresses || []) as string[]),
        ].map((address) => ({ address }));
        const recipients = resolveRecipientContacts(contactIndex, brandId, addresses);
        if (!recipients.ambiguous && recipients.ids.length === 1) contactIds.add(recipients.ids[0]);
      }
    }
  }
  return [...contactIds];
}

function looksLikeVendorOutreach(message: CustomerMailAdmissionMessage) {
  const haystack = `${message.subject || ""}\n${message.bodyText || ""}`.slice(0, 5000);
  return VENDOR_OUTREACH_PATTERNS.some((pattern) => pattern.test(haystack));
}

export async function decideCustomerMailAdmission(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    accountEmail: string;
    message: CustomerMailAdmissionMessage;
    contactIndex: CustomerMailContactIndex;
  },
): Promise<CustomerMailAdmissionDecision> {
  const { brandId, accountEmail, message, contactIndex } = input;

  if (message.mailboxRole === "inbox") {
    const kind = classifyInboundMailSource({
      fromAddress: message.from.address,
      subject: message.subject,
    });
    if (kind !== "customer") {
      return { status: "filtered", reason: `inbound_${kind}`, contactId: null };
    }

    const sender = normalizeEmail(message.from.address);
    const accountDomain = domainOf(accountEmail);
    if (sender && accountDomain && domainOf(sender) === accountDomain) {
      return { status: "filtered", reason: "internal_same_domain", contactId: null };
    }

    const exact = brandMatches(contactIndex, sender, brandId);
    if (exact.length === 1) {
      return { status: "accept", reason: "exact_brand_contact", contactId: exact[0].id };
    }
    if (exact.length > 1) {
      return { status: "review", reason: "duplicate_brand_contact_email", contactId: null };
    }

    const threadContacts = await resolveThreadContactIds(supabase, brandId, message, contactIndex);
    if (threadContacts.length === 1) {
      return { status: "accept", reason: "resolved_customer_thread", contactId: threadContacts[0] };
    }
    if (threadContacts.length > 1) {
      return { status: "review", reason: "ambiguous_customer_thread", contactId: null };
    }

    if (looksLikeVendorOutreach(message)) {
      return { status: "filtered", reason: "vendor_outreach", contactId: null };
    }

    return { status: "review", reason: "unknown_sender_candidate", contactId: null };
  }

  const recipients = resolveRecipientContacts(
    contactIndex,
    brandId,
    [...message.to, ...(message.cc || [])],
  );
  if (recipients.ambiguous) {
    return { status: "filtered", reason: "outbound_ambiguous_recipient", contactId: null };
  }
  if (recipients.ids.length === 1) {
    return { status: "accept", reason: "outbound_exact_brand_contact", contactId: recipients.ids[0] };
  }
  if (recipients.ids.length > 1) {
    return { status: "filtered", reason: "outbound_multi_customer", contactId: null };
  }

  const threadContacts = await resolveThreadContactIds(supabase, brandId, message, contactIndex);
  if (threadContacts.length === 1) {
    return { status: "accept", reason: "outbound_customer_thread", contactId: threadContacts[0] };
  }

  return { status: "filtered", reason: "outbound_non_customer", contactId: null };
}

export async function recordCustomerMailAdmission(
  supabase: SupabaseClient,
  input: {
    accountId: string;
    brandId: string;
    message: CustomerMailAdmissionMessage;
    decision: CustomerMailAdmissionDecision;
    historical: boolean;
  },
) {
  if (input.decision.status === "accept") return;
  const message = input.message;
  const keepBody = input.decision.status === "review";
  const { error } = await supabase.from("email_admission_queue").upsert({
    account_id: input.accountId,
    brand_id: input.brandId,
    external_message_id: message.messageId,
    external_thread_id: message.threadId || message.inReplyTo || message.messageId,
    mailbox_role: message.mailboxRole,
    from_address: message.from.address,
    from_name: message.from.name || null,
    to_addresses: message.to.map((item) => item.address),
    cc_addresses: message.cc?.map((item) => item.address) || null,
    subject: message.subject,
    body_text: keepBody ? (message.bodyText || null) : null,
    body_html: keepBody ? (message.bodyHtml || null) : null,
    received_at: message.date.toISOString(),
    admission_status: input.decision.status,
    admission_reason: input.decision.reason,
    crm_contact_id: null,
    is_historical: input.historical,
    updated_at: new Date().toISOString(),
  }, { onConflict: "account_id,external_message_id" });
  if (error) throw new Error(`Customer-mail admission queue write failed: ${error.message}`);
}

export async function loadCustomerMailAdmissionIds(
  supabase: SupabaseClient,
  accountId: string,
) {
  const ids = new Set<string>();
  const pageSize = 1000;
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const { data, error } = await supabase
      .from("email_admission_queue")
      .select("external_message_id")
      .eq("account_id", accountId)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Customer-mail admission ID lookup failed: ${error.message}`);
    for (const row of data || []) {
      const id = String(row.external_message_id || "").trim();
      if (id) ids.add(id);
    }
    if ((data || []).length < pageSize) break;
  }
  return ids;
}

export async function promoteResolvedCustomerMailReviews(
  supabase: SupabaseClient,
  input: {
    accountId: string;
    brandId: string;
    accountEmail: string;
    contactIndex: CustomerMailContactIndex;
    limit?: number;
  },
) {
  const { data, error } = await supabase
    .from("email_admission_queue")
    .select("*")
    .eq("account_id", input.accountId)
    .eq("admission_status", "review")
    .eq("mailbox_role", "inbox")
    .order("received_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, input.limit || 25)));
  if (error) throw new Error(`Customer-mail review lookup failed: ${error.message}`);

  let promoted = 0;
  for (const row of data || []) {
    const message: CustomerMailAdmissionMessage = {
      messageId: String(row.external_message_id),
      threadId: row.external_thread_id ? String(row.external_thread_id) : undefined,
      from: { name: row.from_name || undefined, address: String(row.from_address || "") },
      to: ((row.to_addresses || []) as string[]).map((address) => ({ address })),
      cc: ((row.cc_addresses || []) as string[]).map((address) => ({ address })),
      subject: String(row.subject || ""),
      date: row.received_at ? new Date(row.received_at) : new Date(),
      bodyText: row.body_text || undefined,
      bodyHtml: row.body_html || undefined,
      mailboxRole: "inbox",
    };
    const decision = await decideCustomerMailAdmission(supabase, {
      brandId: input.brandId,
      accountEmail: input.accountEmail,
      message,
      contactIndex: input.contactIndex,
    });
    if (decision.status !== "accept" || !decision.contactId) continue;

    const existing = await supabase
      .from("email_messages")
      .select("id")
      .eq("brand_id", input.brandId)
      .eq("message_id", message.messageId)
      .limit(1)
      .maybeSingle();
    if (existing.error) throw new Error(`Customer-mail promotion duplicate lookup failed: ${existing.error.message}`);

    let emailMessageId = existing.data?.id ? String(existing.data.id) : null;
    if (!emailMessageId) {
      const historical = Boolean(row.is_historical);
      const inserted = await supabase.from("email_messages").insert({
        brand_id: input.brandId,
        message_id: message.messageId,
        thread_id: message.threadId || message.messageId,
        direction: "inbound",
        from_address: message.from.address,
        from_name: message.from.name || null,
        to_addresses: message.to.map((item) => item.address),
        cc_addresses: message.cc?.map((item) => item.address) || null,
        subject: message.subject,
        body_text: message.bodyText || null,
        body_html: message.bodyHtml || null,
        received_at: message.date.toISOString(),
        is_read: historical,
        is_archived: historical,
        crm_contact_id: decision.contactId,
      }).select("id").single();
      if (inserted.error || !inserted.data?.id) {
        throw new Error(`Customer-mail review promotion failed: ${inserted.error?.message || "missing id"}`);
      }
      emailMessageId = String(inserted.data.id);
    }

    const updated = await supabase.from("email_admission_queue").update({
      admission_status: "promoted",
      admission_reason: `promoted:${decision.reason}`,
      crm_contact_id: decision.contactId,
      promoted_email_message_id: emailMessageId,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    if (updated.error) throw new Error(`Customer-mail promotion marker failed: ${updated.error.message}`);
    promoted += 1;
  }

  return promoted;
}
