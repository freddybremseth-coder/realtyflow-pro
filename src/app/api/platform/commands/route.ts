import { NextRequest, NextResponse } from "next/server";
import { platformDatabaseError, requirePlatformOwner } from "@/lib/platform/request";
import { platformCommandSchema, platformValidationMessage } from "@/lib/platform/validation";
import { executePlatformCommand } from "@/services/platform/platform-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner(request);
  if (!auth.value) return auth.response;
  const parsed = platformCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: platformValidationMessage(parsed.error) }, { status: 400 });
  }
  try {
    const result = await executePlatformCommand(
      auth.value.supabase,
      parsed.data,
      auth.value.context.email,
    );
    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    return platformDatabaseError(error);
  }
}
