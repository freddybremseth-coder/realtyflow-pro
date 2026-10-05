import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAccessContext } from "@/lib/api-admin";
import { hasPermission } from "@/lib/access-control";
import { getContactsSupabase } from "@/app/api/contacts/supabase-client";
import { appendCustomerInteraction } from "@/lib/customer-updates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ContactIdSchema = z.string().uuid();
const RequestSchema = z.object({
  action: z.enum(["TAKE_OVER", "RELEASE"]),
});

function takeoverInteraction(params: { action: "TAKE_OVER" | "RELEASE"; actorEmail: string; date: string }) {
  const takingOver = params.action === "TAKE_OVER";
  return {
    id: crypto.randomUUID(),
    type: takingOver ? "manual_customer_takeover" : "manual_customer_takeover_released",
    date: params.date,
    direction: "internal",
    content: takingOver
      ? "Rådgiver tok over kundedialogen. Automatisk kundemail fra RealtyFlow/Nexus er blokkert."
      : "Rådgiver ga kundedialogen tilbake til RealtyFlow/Nexus. Manuell takeover-sperre er fjernet.",
    metadata: {
      source: "customer-360",
      update_type: "communication_control",
      title: takingOver ? "Manuell kundedialog aktivert" : "Manuell kundedialog avsluttet",
      actor_email: params.actorEmail.toLowerCase(),
      manual_owner_takeover: takingOver,
      no_customer_contact: true,
    },
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { contactId: string } },
) {
  const context = await getRequestAccessContext(request);
  if (!context) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  if (context.role !== "OWNER" && !hasPermission(context.role, "customers.write")) {
    return NextResponse.json({ ok: false, error: "Access permission required", requiredPermission: "customers.write" }, { status: 403 });
  }

  const parsedContactId = ContactIdSchema.safeParse(params.contactId);
  if (!parsedContactId.success) {
    return NextResponse.json({ ok: false, error: "Invalid contact id" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid communication-control action" }, { status: 400 });
  }

  const supabase = getContactsSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "Contacts database is not configured" }, { status: 500 });

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,do_not_contact,email_suppressed,suppression_reason,nurture_status,interactions")
    .eq("id", parsedContactId.data)
    .single();

  if (contactError || !contact) {
    return NextResponse.json({ ok: false, error: contactError?.message || "Customer not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const action = parsed.data.action;

  if (action === "RELEASE") {
    if (contact.do_not_contact) {
      return NextResponse.json({ ok: false, error: "Kunden er markert ikke kontakt. Denne sperren kan ikke fjernes med takeover-knappen." }, { status: 409 });
    }
    if (String(contact.suppression_reason || "") !== "manual_owner_takeover") {
      return NextResponse.json({ ok: false, error: "Kunden har ikke en manuell takeover-sperre som kan fjernes her." }, { status: 409 });
    }
  }

  const interaction = takeoverInteraction({ action, actorEmail: context.email, date: now });
  const updates = action === "TAKE_OVER"
    ? {
        email_suppressed: true,
        suppression_reason: "manual_owner_takeover",
        nurture_status: "paused",
        interactions: appendCustomerInteraction(contact.interactions, interaction),
        updated_at: now,
      }
    : {
        email_suppressed: false,
        suppression_reason: null,
        nurture_status: "paused",
        interactions: appendCustomerInteraction(contact.interactions, interaction),
        updated_at: now,
      };

  const { data: updated, error: updateError } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", parsedContactId.data)
    .select("id,name,email,do_not_contact,email_suppressed,suppression_reason,nurture_status")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ ok: false, error: updateError?.message || "Kunne ikke oppdatere kundedialogen." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    manualTakeover: updated.email_suppressed === true && updated.suppression_reason === "manual_owner_takeover",
    contact: updated,
    message: action === "TAKE_OVER"
      ? "Du har tatt over kunden. Automatisk kundemail fra RealtyFlow/Nexus er blokkert."
      : "Manuell takeover er fjernet. Nurture forblir pauset til du aktivt starter videre oppfølging.",
  });
}
