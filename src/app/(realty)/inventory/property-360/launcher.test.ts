import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(realty)/inventory/property-360/page.tsx"), "utf8");

describe("Property 360 launcher", () => {
  it("supports property id, reference and title lookup", () => {
    expect(page).toContain('type LookupMode = "propertyId" | "reference" | "title"');
    expect(page).toContain('<option value="reference">Referanse</option>');
    expect(page).toContain('<option value="propertyId">Bolig-ID</option>');
    expect(page).toContain('<option value="title">Tittel</option>');
  });

  it("keeps the workspace read-only with respect to matching and outbound communication", () => {
    expect(page).toContain("Dette starter ingen ny matchingjobb");
    expect(page).toContain("Ingen e-post, SMS eller WhatsApp sendes fra denne handlingen.");
    expect(page).not.toContain("/api/property-pdf/send");
  });

  it("preserves guarded message preparation and Customer 360 continuation", () => {
    expect(page).toContain("Prepare message");
    expect(page).toContain("Klargjort melding — ikke sendt");
    expect(page).toContain("Fortsett i Customer 360");
  });
});
