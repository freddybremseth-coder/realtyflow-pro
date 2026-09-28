import { describe, expect, it } from "vitest";
import { classifyInboundMailSource } from "./inbound-mail-filter";

describe("classifyInboundMailSource", () => {
  it("keeps real customer replies", () => expect(classifyInboundMailSource({ fromAddress:"kunde@example.com", subject:"Re: Er bolig fortsatt aktuelt?" })).toBe("customer"));
  it("filters delivery failures", () => expect(classifyInboundMailSource({ fromAddress:"MAILER-DAEMON@mailchannels.net", subject:"Undelivered Mail Returned to Sender" })).toBe("bounce"));
  it("filters no-reply security mail", () => expect(classifyInboundMailSource({ fromAddress:"no-reply@accounts.google.com", subject:"Security alert" })).toBe("system"));
  it("filters auto-generated mail", () => expect(classifyInboundMailSource({
    fromAddress:"service@example.com", subject:"Automatic notification", autoSubmitted:"auto-generated",
  })).toBe("system"));
  it("filters property newsletters", () => expect(classifyInboundMailSource({ fromAddress:"1001@alteahills.es", subject:"8 new properties from AH Realty" })).toBe("newsletter"));
  it("filters standards-based mailing lists", () => expect(classifyInboundMailSource({
    fromAddress:"hello@agency.example", subject:"September homes", listId:"homes.agency.example", listUnsubscribe:"<mailto:unsubscribe@agency.example>",
  })).toBe("newsletter"));
  it("filters bulk precedence mail", () => expect(classifyInboundMailSource({
    fromAddress:"updates@agency.example", subject:"September homes", precedence:"bulk",
  })).toBe("newsletter"));
  it("filters newsletter-style sender identities", () => expect(classifyInboundMailSource({
    fromAddress:"newsletter@agency.example", subject:"September homes",
  })).toBe("newsletter"));
  it("filters strong unsubscribe-footer evidence", () => expect(classifyInboundMailSource({
    fromAddress:"hello@agency.example", subject:"September homes",
    bodyText:"View this email in your browser. Manage your email preferences or unsubscribe.",
  })).toBe("newsletter"));
  it("filters Instagram recap notifications", () => expect(classifyInboundMailSource({ fromAddress:"posts-recap@mail.instagram.com", subject:"Se hva som er nytt på Instagram" })).toBe("system"));
  it("filters Supabase platform mail", () => expect(classifyInboundMailSource({ fromAddress:"welcome@supabase.com", subject:"Supa Update Sep 2026" })).toBe("system"));
  it("filters supplier collaboration outreach", () => expect(classifyInboundMailSource({ fromAddress:"michel@builder.example", subject:"Re: Collaboration" })).toBe("vendor"));
  it("filters furniture sales outreach", () => expect(classifyInboundMailSource({ fromAddress:"prod@vendor.example", subject:"For ZEN ECO HOMES: Unified furniture solutions for villa spaces" })).toBe("vendor"));
});
