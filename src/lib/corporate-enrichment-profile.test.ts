import assert from "node:assert/strict";
import test from "node:test";
import { buildCorporateEnrichmentProfile } from "@/lib/corporate-enrichment/company-profile";

test("Corporate enrichment profile merges 1881 and Brønnøysund fields and verifies matches", () => {
  const profile = buildCorporateEnrichmentProfile(
    {
      company_name: "PEAB BYGG AS",
      organization_number: "943672520",
      employee_count: 407,
      website_url: "https://www.peab.no/bygg",
    },
    [
      {
        provider: "api1881",
        fetched_at: "2026-10-05T12:40:00Z",
        payload: {
          contacts: [{
            organizationNumber: "943672520",
            infoUrl: "https://www.1881.no/example",
            contactPoints: [
              { main: true, type: "Phone", label: "Telefon", value: "23303000" },
              { main: false, type: "Email", label: "E-post", value: "info@peab.no" },
            ],
            geography: { address: { addressString: "Hjalmar Johansens gate 25, 9007 Tromsø" } },
            legalInformation: { legalName: "Peab Bygg AS", employees: 407 },
            roles: [
              { type: "Person", name: "Arild Østgård", role: "Daglig leder", birthDate: "1964-06-29" },
            ],
          }],
        },
      },
      {
        provider: "brreg",
        fetched_at: "2026-10-05T12:45:00Z",
        payload: {
          entity: {
            organisasjonsnummer: "943672520",
            navn: "PEAB BYGG AS",
            telefon: "23 30 30 00",
            epostadresse: "info@peab.no",
            antallAnsatte: 407,
            forretningsadresse: {
              adresse: ["Hjalmar Johansens gate 25"],
              postnummer: "9007",
              poststed: "Tromsø",
            },
          },
          roles: {
            rollegrupper: [{
              roller: [{
                avregistrert: false,
                type: { kode: "DAGL", beskrivelse: "Daglig leder" },
                person: {
                  navn: { fornavn: "Arild", mellomnavn: "", etternavn: "Østgård" },
                  fodselsdato: "1964-06-29",
                  erDoed: false,
                },
              }],
            }],
          },
        },
      },
    ],
  );

  assert.equal(profile.address?.verified, true);
  assert.equal(profile.phones[0]?.verified, true);
  assert.deepEqual(profile.phones[0]?.sources.sort(), ["1881", "Brønnøysund"].sort());
  assert.equal(profile.emails[0]?.verified, true);
  assert.equal(profile.employees?.verified, true);

  const manager = profile.publicRoles.find(role => role.title === "Daglig leder");
  assert.ok(manager);
  assert.equal(manager?.name, "Arild Østgård");
  assert.equal(manager?.verified, true);
  assert.deepEqual(manager?.sources.sort(), ["1881", "Brønnøysund"].sort());

  assert.equal("birthDate" in (manager as any), false);
  assert.equal("fodselsdato" in (manager as any), false);
});


test("Corporate enrichment profile reuses stored Brønnøysund discovery evidence without another lookup", () => {
  const profile = buildCorporateEnrichmentProfile(
    {
      company_name: "PEAB BYGG AS",
      organization_number: "943672520",
      employee_count: 407,
      website_url: "https://www.peab.no/bygg",
      evidence: {
        provider: "Brønnøysundregistrene · Enhetsregisteret åpne data",
        has_registered_employee_count: true,
        business_address: {
          adresse: ["Hjalmar Johansens gate 25"],
          postnummer: "9007",
          poststed: "TROMSØ",
        },
        generic_company_contact: {
          generic_email: "info@peab.no",
        },
      },
    },
    [{
      provider: "api1881",
      fetched_at: "2026-10-05T12:40:00Z",
      payload: {
        contacts: [{
          contactPoints: [
            { main: true, type: "Phone", label: "Telefon", value: "23303000" },
            { main: false, type: "Email", label: "E-post", value: "info@peab.no" },
          ],
          geography: { address: { addressString: "Hjalmar Johansens gate 25, 9007 Tromsø" } },
          legalInformation: { employees: 407 },
          organizationNumber: "943672520",
        }],
      },
    }],
  );

  assert.equal(profile.address?.verified, true);
  assert.deepEqual(profile.address?.sources.sort(), ["1881", "Brønnøysund"].sort());
  assert.equal(profile.employees?.verified, true);
  assert.deepEqual(profile.employees?.sources.sort(), ["1881", "Brønnøysund"].sort());
  assert.equal(profile.emails.find(item => item.value === "info@peab.no")?.verified, true);
});
