import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { processEmailMessage } from "@/services/email/process-email-message";

/** POST /api/email/analyze — analyze one stored inbound email and create/update a reply draft. */
export async function POST(req: NextRequest) {
  try {
    const { email_id } = await req.json();
    if (!email_id) return NextResponse.json({ error: "email_id is required" }, { status: 400 });

    const supabase = createServerClient();
    const result = await processEmailMessage(supabase, String(email_id));
    return NextResponse.json({ success: true, analysis: result.analysis, context_match: result.context_match, draft: result.draft });
  } catch (error) {
    console.error("[Email Analyze]", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: message === "Email not found" ? 404 : 500 });
  }
}
