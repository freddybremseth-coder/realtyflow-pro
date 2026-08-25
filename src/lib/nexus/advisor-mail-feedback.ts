export interface AdvisorMailFeedbackContext {
  baseUrl: string;
  contactId: string;
  brandId?: string | null;
  campaignId?: string | null;
}

export function buildAdvisorMailFeedbackUrl(
  ctx: AdvisorMailFeedbackContext,
  propertyId: string,
  action: "interested" | "not_for_me"
) {
  const base = ctx.baseUrl.replace(/\/$/, "");
  const q = new URLSearchParams({
    contact: ctx.contactId,
    property: propertyId,
    action,
  });
  if (ctx.brandId) q.set("brand", ctx.brandId);
  if (ctx.campaignId) q.set("campaign", ctx.campaignId);
  return `${base}/api/nexus/advisor-mail/feedback?${q.toString()}`;
}

export function renderPropertyFeedbackActions({
  interestedUrl,
  notForMeUrl,
}: {
  interestedUrl: string;
  notForMeUrl: string;
}) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px"><tr>
    <td style="padding-right:8px"><a href="${escapeAttr(interestedUrl)}" style="display:inline-block;background:#15202b;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;font-weight:700;border-radius:6px;padding:10px 14px">Interessant</a></td>
    <td><a href="${escapeAttr(notForMeUrl)}" style="display:inline-block;background:#fff;color:#5c6672;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;font-weight:700;border:1px solid #d8d3c7;border-radius:6px;padding:9px 13px">Ikke for meg</a></td>
  </tr></table>`;
}

function escapeAttr(value: string) {
  return String(value).replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
