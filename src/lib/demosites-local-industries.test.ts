import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_INDUSTRY_TEMPLATES,
  classifyLocalIndustry,
  upgradeProfileImportResult,
} from "./demosites-local-industries";

test("roof producer is classified as roof/facade even when transport is mentioned", () => {
  const result = classifyLocalIndustry({
    company_name: "Vestfold Takproduksjon AS",
    title: "Takplater og komplette taksystemer",
    description: "Vi produserer takplater, beslag og fasadeprodukter. Transport til byggeplass kan avtales.",
    services: ["Produksjon av takplater", "Prosjektering og mengdeberegning", "Transport og levering"],
    products: ["Takplater", "Beslag", "Fasadeplater"],
  });

  assert.equal(result?.slug, "tak-fasade");
  assert.notEqual(result?.slug, "frakt");
});

test("generic transport wording alone does not select freight", () => {
  const result = classifyLocalIndustry({
    company_name: "Nordic Møbler AS",
    title: "Norskproduserte møbler",
    description: "Vi tilbyr transport og levering av alle produkter i Vestfold.",
    products: ["Spisebord", "Stoler", "Skjenker"],
  });

  assert.equal(result, null);
});

test("actual logistics company selects freight template", () => {
  const result = classifyLocalIndustry({
    company_name: "Larvik Logistikkfirma AS",
    title: "Godstransport, distribusjon og budbil",
    description: "Fast varetransport for bedrifter i Vestfold og Telemark.",
    services: ["Godstransport", "Budbil", "Faste distribusjonsruter"],
  });

  assert.equal(result?.slug, "frakt");
  assert.ok((result?.strongMatches.length || 0) > 0);
});

test("therapist and adviser have distinct templates", () => {
  assert.equal(
    classifyLocalIndustry({
      company_name: "Trygge Samtaler",
      title: "Familieterapeut og parterapi i Sandefjord",
      services: ["Samtaleterapi", "Parterapi", "Familiesamtaler"],
    })?.slug,
    "terapeut",
  );

  assert.equal(
    classifyLocalIndustry({
      company_name: "Fjord Rådgivning",
      title: "Bedriftsrådgivning og strategi",
      services: ["Strategiworkshop", "Forretningsutvikling", "Lederstøtte"],
    })?.slug,
    "radgiver",
  );
});

test("legacy freight false positive is downgraded when only transport was found", () => {
  const upgraded = upgradeProfileImportResult({
    profile: {
      company_name: "Takpartner AS",
      title: "Takstein og beslag",
      description: "Transport kan bestilles sammen med produktene.",
      recommended_template_slug: "frakt",
      services: ["Takstein", "Beslag", "Levering"],
    },
    editable_fields: { template_slug: "frakt", hero_title: "Transport når du trenger det" },
    warnings: [],
  });

  assert.equal(upgraded.changed, true);
  assert.equal(upgraded.profile.recommended_template_slug, "tak-fasade");
  assert.equal(upgraded.editable_fields.template_slug, "tak-fasade");
});

test("catalog contains the requested local business types", () => {
  const slugs = new Set(LOCAL_INDUSTRY_TEMPLATES.map((item) => item.slug));
  for (const slug of ["radgiver", "tannlege", "terapeut", "bilverksted", "handverker", "tak-fasade", "regnskapsforer", "fotograf", "veterinaer", "hage-anlegg", "interior-kjokken-bad", "trening-helse"]) {
    assert.equal(slugs.has(slug), true, `missing ${slug}`);
  }
});
