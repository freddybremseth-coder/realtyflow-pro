export function sourcePredatesApprovedBuyerProfile(
  sourceReceivedAt: string | null | undefined,
  profileApprovedAt: string | null | undefined,
) {
  if (!sourceReceivedAt || !profileApprovedAt) return false;
  const sourceTime = Date.parse(sourceReceivedAt);
  const approvedTime = Date.parse(profileApprovedAt);
  if (!Number.isFinite(sourceTime) || !Number.isFinite(approvedTime)) return false;
  return sourceTime <= approvedTime;
}
