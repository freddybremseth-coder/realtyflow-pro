import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getPersonalIntelligenceOwnerUserId, getPersonalIntelligenceSupabase } from "@/lib/personal-intelligence/supabase";
import { runMentorTurn } from "@/lib/personal-intelligence/mentor-runtime";
import type { PersonalPrivacyLevel } from "@/lib/personal-intelligence/privacy-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRIVACY_LEVELS = new Set<PersonalPrivacyLevel>(["public", "internal", "private", "sensitive", "restricted"]);
const SENSITIVE_SCOPES = new Set<PersonalPrivacyLevel>(["sensitive", "restricted"]);

async function logSensitivePermissionEvent(
  supabase: ReturnType<typeof getPersonalIntelligenceSupabase>,
  input: {
    ownerUserId: string;
    sessionId?: string | null;
    scope: "sensitive" | "restricted";
    granted: boolean;
  },
) {
  const { error } = await supabase.schema("mentor").from("audit_events").insert({
    owner_user_id: input.ownerUserId,
    session_id: input.sessionId ?? null,
    event_type: input.granted ? "sensitive_context_permission_granted" : "sensitive_context_permission_denied",
    resource_schema: "mentor",
    resource_type: "privacy_permission",
    resource_id: input.sessionId ?? null,
    details: {
      requested_scope: input.scope,
      granted: input.granted,
      reason: input.granted ? "explicit_user_permission" : "explicit_permission_required",
      sensitive_content_recorded: false,
    },
  });
  if (error) throw new Error(`Failed to audit sensitive context permission: ${error.message}`);
}

export async function POST(request: NextRequest) {
  try {
    const access = await getRequestAccessContext(request);
    if (!access || access.role !== "OWNER") {
      return NextResponse.json({ error: "Owner session required" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const subjectEntityId = typeof body.subjectEntityId === "string" ? body.subjectEntityId.trim() : "";
    const requestedScope = typeof body.privacyScope === "string" ? body.privacyScope : "internal";

    if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });
    if (!subjectEntityId) return NextResponse.json({ error: "subjectEntityId is required" }, { status: 400 });
    if (!PRIVACY_LEVELS.has(requestedScope as PersonalPrivacyLevel)) {
      return NextResponse.json({ error: "Invalid privacyScope" }, { status: 400 });
    }

    const privacyScope = requestedScope as PersonalPrivacyLevel;
    const explicitSensitivePermission = body.explicitSensitivePermission === true;
    const supabase = getPersonalIntelligenceSupabase();
    const ownerUserId = await getPersonalIntelligenceOwnerUserId(supabase);

    if (SENSITIVE_SCOPES.has(privacyScope) && !explicitSensitivePermission) {
      await logSensitivePermissionEvent(supabase, {
        ownerUserId,
        scope: privacyScope as "sensitive" | "restricted",
        granted: false,
      });
      return NextResponse.json(
        { error: `${privacyScope} context requires explicitSensitivePermission=true` },
        { status: 400 },
      );
    }

    const result = await runMentorTurn(supabase, {
      ownerUserId,
      subjectEntityId,
      message,
      privacyScope,
      explicitSensitivePermission,
      thinkDeeper: body.thinkDeeper === true,
    });

    if (SENSITIVE_SCOPES.has(privacyScope)) {
      await logSensitivePermissionEvent(supabase, {
        ownerUserId,
        sessionId: result.sessionId,
        scope: privacyScope as "sensitive" | "restricted",
        granted: true,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Personal Intelligence Mentor]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Personal Intelligence mentor failed" },
      { status: 500 },
    );
  }
}
