import { describe, expect, it } from "vitest";
import { buildAdvisorMailFeedbackUrl, renderPropertyFeedbackActions } from "./advisor-mail-feedback";

describe("advisor mail property feedback", () => {
  it("builds interested and not-for-me URLs with customer context", () => {
    const ctx = {
      baseUrl: "https://realtyflow.example/",
      contactId: "contact-1",
      brandId: "zeneco",
      campaignId: "mail-42",
    };

    expect(buildAdvisorMailFeedbackUrl(ctx, "prop-7", "interested")).toContain(
      "/api/nexus/advisor-mail/feedback?contact=contact-1&property=prop-7&action=interested&brand=zeneco&campaign=mail-42"
    );
    expect(buildAdvisorMailFeedbackUrl(ctx, "prop-7", "not_for_me")).toContain("action=not_for_me");
  });

  it("renders both customer actions", () => {
    const html = renderPropertyFeedbackActions({
      interestedUrl: "https://example.com/yes?a=1&b=2",
      notForMeUrl: "https://example.com/no",
    });
    expect(html).toContain("Interessant");
    expect(html).toContain("Ikke for meg");
    expect(html).toContain("&amp;");
  });
});
