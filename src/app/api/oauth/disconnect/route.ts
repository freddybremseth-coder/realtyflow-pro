import { NextRequest, NextResponse } from "next/server";

import {
  deleteChannel,
  getChannelById,
  setChannelActive,
} from "@/lib/oauth/channels";

/**
 * POST /api/oauth/disconnect
 * Body: { social_channel_id: string; hard?: boolean }
 *
 * Soft-disconnect (default): sets `is_active=false`. The row sticks around
 * for audit and so re-running OAuth for the same external account quickly
 * re-activates it (the unique constraint on `(brand, platform, external)`
 * means re-OAuth upserts back into the same row).
 *
 * Hard-disconnect (`hard: true`): deletes the channel and, via FK cascade,
 * its oauth_tokens row. Use only when the user explicitly wants no trace
 * of the connection.
 *
 * We do NOT call provider revocation endpoints from here — those flows are
 * fragile (Google rate-limits, Facebook silently no-ops on already-revoked
 * tokens) and a soft-disconnect is enough to stop the publisher from using
 * the credentials.
 */
export async function POST(req: NextRequest) {
  let body: { social_channel_id?: unknown; hard?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const channelId = typeof body.social_channel_id === "string" ? body.social_channel_id : "";
  if (!channelId) {
    return NextResponse.json({ error: "Missing social_channel_id" }, { status: 400 });
  }
  const hard = body.hard === true;

  const channel = await getChannelById(channelId);
  if (!channel) {
    return NextResponse.json({ error: "Unknown channel" }, { status: 404 });
  }

  try {
    if (hard) {
      await deleteChannel(channelId);
    } else {
      await setChannelActive(channelId, false);
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Disconnect failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    mode: hard ? "deleted" : "deactivated",
    channel_id: channelId,
  });
}
