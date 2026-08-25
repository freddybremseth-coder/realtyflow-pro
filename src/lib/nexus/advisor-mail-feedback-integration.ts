import { buildAdvisorMailFeedbackUrl, renderPropertyFeedbackActions } from "./advisor-mail-feedback";

export function renderAdvisorMailPropertyFeedback({
  baseUrl,
  contactId,
  brandId,
  campaignId,
  propertyId,
}: {
  baseUrl: string;
  contactId: string;
  brandId?: string | null;
  campaignId?: string | null;
  propertyId: string;
}) {
  const ctx = { baseUrl, contactId, brandId, campaignId };
  return renderPropertyFeedbackActions({
    interestedUrl: buildAdvisorMailFeedbackUrl(ctx, propertyId, "interested"),
    notForMeUrl: buildAdvisorMailFeedbackUrl(ctx, propertyId, "not_for_me"),
  });
}
