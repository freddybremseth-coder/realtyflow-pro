import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const youtubeHealth = fs.readFileSync(
  path.join(process.cwd(), "src/services/integrations/youtube-health.ts"),
  "utf8",
);
const integrationsHealth = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/integrations/health/route.ts"),
  "utf8",
);

describe("canonical YouTube health routing contract", () => {
  it("refreshes expired Google access tokens instead of failing on stale access", () => {
    expect(youtubeHealth).toContain("tokens.expiresAt");
    expect(youtubeHealth).toContain("refresh_token: clean(tokens.refreshToken)");
    expect(youtubeHealth).toContain("await auth.getAccessToken()");
  });

  it("verifies the exact stored external channel id", () => {
    expect(youtubeHealth).toContain("item.id) === String(channel.external_id)");
    expect(youtubeHealth).toContain('reason: "channel_mismatch"');
  });

  it("fails closed on multiple active YouTube channels for one brand", () => {
    expect(youtubeHealth).toContain("if (channels.length > 1)");
    expect(youtubeHealth).toContain('reason: "ambiguous_channel"');
  });

  it("does not use legacy brand_settings refresh tokens as brand health truth", () => {
    expect(youtubeHealth).not.toContain("brand_settings").or.toContain("Historical");
    expect(youtubeHealth).not.toContain("youtube_refresh_token");
  });

  it("uses exact-channel YouTube health in the global integration surface", () => {
    expect(integrationsHealth).toContain("checkYouTubeChannelHealth(channel.id)");
    expect(integrationsHealth).toContain("routingIssues");
    expect(integrationsHealth).toContain('code: "shared_external_account"');
    expect(integrationsHealth).toContain('code: "duplicate_brand_platform"');
  });
});
