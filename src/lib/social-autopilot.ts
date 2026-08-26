export interface SocialAutopilotRow {
  brandId: string;
  brandName: string;
  platform: string | null;
  connected: boolean;
  pilotReady: boolean;
  pilotBlockReason: string | null;
  published: number;
  measuredEligible: number;
  quarantined: number;
  liveLearning: boolean;
}

export function summarizeSocialAutopilot(rows: SocialAutopilotRow[]) {
  const connected = rows.filter((row) => row.connected).length;
  const pilotReady = rows.filter((row) => row.pilotReady).length;
  const liveLearning = rows.filter((row) => row.liveLearning).length;
  const published = rows.reduce((sum, row) => sum + Number(row.published || 0), 0);
  const eligible = rows.reduce((sum, row) => sum + Number(row.measuredEligible || 0), 0);
  const quarantined = rows.reduce((sum, row) => sum + Number(row.quarantined || 0), 0);
  const blockers = rows.filter((row) => row.connected && !row.pilotReady && Boolean(row.pilotBlockReason));

  return {
    connected,
    pilotReady,
    liveLearning,
    published,
    eligible,
    quarantined,
    blockers,
    needsAttention: blockers.length + (quarantined > 0 ? 1 : 0),
  };
}
