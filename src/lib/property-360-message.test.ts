import { describe, expect, it } from "vitest";
import { prepareProperty360Message } from "@/lib/property-360-message";

describe("prepareProperty360Message", () => {
  it("uses stored match reason and property facts without sending anything", () => {
    const draft = prepareProperty360Message(
      { title: "Villa Mar", location: "Altea", price: 495000, reference: "ZE-42" },
      { contactName: "Harald Hansen", reason: "Budsjett og område matcher kundens lagrede profil." },
    );

    expect(draft).toContain("Hei Harald,");
    expect(draft).toContain("Villa Mar");
    expect(draft).toContain("Altea");
    expect(draft).toContain("ZE-42");
    expect(draft).toContain("Budsjett og område matcher kundens lagrede profil.");
    expect(draft).not.toContain("sendt");
  });

  it("surfaces unresolved verification items conservatively", () => {
    const draft = prepareProperty360Message(
      { title: "Penthouse Sol" },
      {
        contactName: "Anna",
        reason: "Soverom og boligtype matcher.",
        questionsToVerify: ["Bekreft etasje", "Bekreft felleskostnader", "Ignorer tredje punkt"],
      },
    );

    expect(draft).toContain("Bekreft etasje; Bekreft felleskostnader");
    expect(draft).not.toContain("Ignorer tredje punkt");
  });
});
