export interface ReceiptIdentity {
  contactId: string | null;
  brandId: string | null;
  resolution: "contact_id" | "email" | "unresolved" | "not_applicable";
}

export interface ReceiptIdentitySupabaseLike {
  from(table: string): any;
}

function text(value: unknown) {
  return String(value || "").trim();
}

export async function resolveReceiptIdentity(
  supabase: ReceiptIdentitySupabaseLike,
  customerRef?: string | null,
): Promise<ReceiptIdentity> {
  const ref = text(customerRef);
  if (!ref) return { contactId: null, brandId: null, resolution: "not_applicable" };

  const column = ref.includes("@") ? "email" : "id";
  const { data, error } = await supabase
    .from("contacts")
    .select("id,brand_id")
    .eq(column, ref)
    .limit(1);

  if (error || !Array.isArray(data) || !data[0]?.id) {
    return { contactId: null, brandId: null, resolution: "unresolved" };
  }

  return {
    contactId: String(data[0].id),
    brandId: text(data[0].brand_id) || null,
    resolution: column === "email" ? "email" : "contact_id",
  };
}
