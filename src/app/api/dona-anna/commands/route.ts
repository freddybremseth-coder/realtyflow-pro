import { NextRequest, NextResponse } from "next/server";
import { donaAnnaDatabaseError, requireDonaAnnaRequest } from "@/lib/dona-anna/request";
import { donaAnnaCommandSchema, validationMessage } from "@/lib/dona-anna/validation";
import { executeDonaAnnaCommand } from "@/services/dona-anna/commerce-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireDonaAnnaRequest(request, "write");
  if (!auth.value) return auth.response;
  const parsed = donaAnnaCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }
  try {
    const result = await executeDonaAnnaCommand(
      auth.value.supabase,
      parsed.data,
      auth.value.context.email,
    );
    return NextResponse.json({ result }, { status: parsed.data.command.startsWith("upsert_") ? 200 : 201 });
  } catch (error) {
    return donaAnnaDatabaseError(error);
  }
}
