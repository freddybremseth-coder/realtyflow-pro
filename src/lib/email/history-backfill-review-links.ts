export function buildEmailHistoryReviewLinks(brandId: string) {
  const brand = encodeURIComponent(brandId.trim());
  const base = `/nexus-os/email-link-health?brand=${brand}`;
  return {
    emailLinkHealth: base,
    highPriority: `${base}&priority=high`,
  };
}
