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
  surfaceKind?: "destination" | "signal";
  attentionRequired?: boolean;
  attentionReason?: string | null;
}

export function summarizeSocialAutopilot(rows: SocialAutopilotRow[]) {
  const destinationRows = rows.filter((row) => (row.surfaceKind ?? "destination") === "destination");
  const signalRows = rows.filter((row) => row.surfaceKind === "signal");
  const connected = destinationRows.filter((row) => row.connected).length;
  const connectedSignals = signalRows.filter((row) => row.connected).length;
  const pilotReady = destinationRows.filter((row) => row.pilotReady).length;
  const liveLearning = destinationRows.filter((row) => row.liveLearning).length;
  const published = destinationRows.reduce((sum, row) => sum + Number(row.published || 0), 0);
  const eligible = destinationRows.reduce((sum, row) => sum + Number(row.measuredEligible || 0), 0);
  const quarantined = destinationRows.reduce((sum, row) => sum + Number(row.quarantined || 0), 0);
  const attentionRows = destinationRows.filter((row) => row.attentionRequired === true);
  const blockers = attentionRows.filter((row) => Boolean(row.attentionReason || row.pilotBlockReason));

  return {
    connected,
    connectedSignals,
    pilotReady,
    liveLearning,
    published,
    eligible,
    quarantined,
    blockers,
    attentionRows,
    needsAttention: attentionRows.length,
  };
}
