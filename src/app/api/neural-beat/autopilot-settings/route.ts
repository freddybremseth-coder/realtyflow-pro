import { NextRequest, NextResponse } from "next/server";
import {
  defaultRemasterAutopilotSettings,
  getRemasterAutopilotSettings,
  saveRemasterAutopilotSettings,
  type RemasterAutopilotMode,
} from "@/services/growth/remaster-autopilot-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function authorizeMigration(request: NextRequest) {
  const expected = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!expected) return true;
  return (request.headers.get("x-remaster-migration-secret") || "") === expected;
}

function isMode(value: unknown): value is RemasterAutopilotMode {
  return value === "off" || value === "preview" || value === "plan_non_destructive" || value === "execute_guarded";
}

export async function GET(request: NextRequest) {
  if (!authorizeMigration(request)) {
    return NextResponse.json({ error: "Unauthorized migration client" }, { status: 401 });
  }

  try {
    const settings = await getRemasterAutopilotSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load autopilot settings";
    if (/missing/i.test(message)) {
      return NextResponse.json({ settings: defaultRemasterAutopilotSettings(), warning: message });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!authorizeMigration(request)) {
    return NextResponse.json({ error: "Unauthorized migration client" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (!isMode(body.mode)) {
    return NextResponse.json({ error: "Ugyldig autopilot-modus" }, { status: 400 });
  }

  const maxActionsPerRun = Number(body.maxActionsPerRun || 3);
  if (!Number.isFinite(maxActionsPerRun) || maxActionsPerRun < 1 || maxActionsPerRun > 10) {
    return NextResponse.json({ error: "Maks antall tiltak må være mellom 1 og 10" }, { status: 400 });
  }

  try {
    const settings = await saveRemasterAutopilotSettings(
      {
        mode: body.mode,
        allowMetadataUpdates: body.mode === "execute_guarded",
        allowNonDestructivePlans: body.mode === "plan_non_destructive" || body.mode === "execute_guarded",
        maxActionsPerRun,
      },
      request.headers.get("x-remaster-admin") || "freddy.bremseth@gmail.com",
    );

    return NextResponse.json({
      success: true,
      message: settings.mode === "off"
        ? "Autopilot er slått av."
        : settings.mode === "preview"
          ? "Autopilot analyserer og forhåndsviser, men utfører ingenting."
          : settings.mode === "plan_non_destructive"
            ? "Autopilot kan lagre ikke-destruktive planer."
            : "Guarded autopilot er aktiv: beskrivelse/tags og sikre playlist-tiltak kan utføres automatisk, logges og måles. Titler og thumbnails forblir manuelle.",
      settings,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save autopilot settings" },
      { status: 500 },
    );
  }
}
