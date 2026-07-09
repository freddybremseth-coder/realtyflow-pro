import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/api-admin";

const leadSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(80).optional(),
  source: z.string().trim().max(120).optional(),
  status: z.enum(["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "WON", "ON_HOLD", "LOST"]).optional(),
  property: z.string().trim().max(240).optional(),
  value: z.number().optional(),
  notes: z.string().trim().max(5000).optional(),
});

export async function GET(req: NextRequest) {
  const adminError = await requireAdminApi(req, { leads: [] });
  if (adminError) return adminError;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ leads: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const adminError = await requireAdminApi(req);
  if (adminError) return adminError;

  const body = await req.json().catch(() => ({}));
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid lead payload" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("leads")
      .insert(parsed.data)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ lead: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
