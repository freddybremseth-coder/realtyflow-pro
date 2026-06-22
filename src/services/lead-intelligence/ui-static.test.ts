import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

const clientPath = path.join(
  process.cwd(),
  "src/components/lead-intelligence/lead-intelligence-client.tsx",
);
const inventoryPath = path.join(process.cwd(), "src/app/(realty)/inventory/page.tsx");

test("Lead Intelligence preview exposes only local review actions", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("Kopier JSON"), true);
  assert.equal(source.includes("Start på nytt"), true);
  assert.equal(source.includes("Analyser på nytt"), true);
  assert.equal(source.includes("Lagre intake og kjøperprofil"), true);
  assert.equal(source.includes("Vis kontaktkandidater"), true);
  assert.equal(source.includes("Hent CRM-kontekst"), true);
  assert.equal(source.includes("Forhåndsvis valgte eiendommer"), true);
  assert.equal(source.includes("Lagre shortlist-utkast"), true);
  assert.equal(source.includes("Profesjonelt presentasjonsutkast"), true);
  assert.equal(source.includes("Lagre presentasjonsutkast"), true);
  assert.equal(source.includes("Kopier presentasjon"), true);
  assert.equal(source.includes("Kopier e-postutkast"), true);
  assert.equal(source.includes("Lagrede tester og kjøperprofiler"), true);
  assert.equal(source.includes("Oppdater lagrede saker"), true);
  assert.equal(source.includes("Fortsett med denne profilen"), true);
  assert.equal(source.includes("Aktiv lagret profil"), true);
  assert.equal(source.includes("Opprett lead"), false);
  assert.equal(source.includes("Send til kunde"), false);
  assert.equal(source.includes("Finn boliger"), false);
  assert.equal(source.includes("E-post sendt: nei"), true);
  assert.equal(source.includes("Property matching: nei"), true);
});

test("Lead Intelligence preview does not call CRM, lead, email, property, or Supabase endpoints directly", async () => {
  const source = await readFile(clientPath, "utf8");
  const forbidden = [
    "/api/contacts",
    "/api/leads",
    "/api/email",
    "/api/properties",
    "/api/neural-beat",
    "supabase",
  ];

  for (const needle of forbidden) {
    assert.equal(source.includes(needle), false, `${needle} should not appear in preview UI`);
  }

  assert.equal(source.includes("/api/lead-intelligence/analyze"), true);
  assert.equal(source.includes("/api/lead-intelligence/contact-candidates"), true);
  assert.equal(source.includes("/api/lead-intelligence/crm-context"), true);
  assert.equal(source.includes("/api/lead-intelligence/review"), true);
  assert.equal(source.includes("/api/lead-intelligence/property-matches/preview"), true);
  assert.equal(source.includes("/api/lead-intelligence/shortlists"), true);
  assert.equal(source.includes("/api/lead-intelligence/presentations"), true);
  assert.equal(source.includes("/api/lead-intelligence/worklist"), true);
});

test("Lead Intelligence worklist is read-only and does not expose raw stored payloads", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("worklistResult"), true);
  assert.equal(source.includes("loadWorklist"), true);
  assert.equal(source.includes("Tidligere lagrede tester ligger her"), true);
  assert.equal(source.includes("Arbeidslisten hentes automatisk"), true);
  assert.equal(source.includes("continueFromWorklistItem"), true);
  assert.equal(source.includes("loadLatestPresentationDraft"), true);
  assert.equal(source.includes("loadPresentationDraftHistory"), true);
  assert.equal(source.includes("Åpne siste e-postutkast"), true);
  assert.equal(source.includes("Vis utkasthistorikk"), true);
  assert.equal(source.includes("Utkasthistorikk"), true);
  assert.equal(source.includes("Historikken henter bare metadata"), true);
  assert.equal(source.includes("InternalPresentationPreview"), true);
  assert.equal(source.includes("Intern presentasjons-preview"), true);
  assert.equal(source.includes("Viser trygg preview fra lagret presentasjon"), true);
  assert.equal(source.includes("Åpne bolig"), true);
  assert.equal(source.includes("Åpne i RealtyFlow"), true);
  assert.equal(source.includes("internalInventoryPropertyUrl"), true);
  assert.equal(source.includes("PresentationPreviewList"), true);
  assert.equal(source.includes("Lenke mangler i eiendomsdata"), true);
  assert.equal(source.includes("2xl:grid-cols-3"), true);
  assert.equal(source.includes("lead-intelligence-active-presentation-draft"), true);
  assert.equal(source.includes("active-profile-history-email-subject"), true);
  assert.equal(source.includes("Endringer her er lokale"), true);
  assert.equal(source.includes("Lagret presentasjonsutkast hentet read-only."), true);
  assert.equal(source.includes("Lagret buyer profile valgt fra arbeidslisten."), true);
  assert.equal(source.includes("Du kan kjøre ny eiendomsmatch på denne lagrede profilen"), true);
  assert.equal(source.includes("Ingen lagrede Lead Intelligence-saker"), true);
  assert.equal(source.includes("raw_text_restricted"), false);
  assert.equal(source.includes("result_json"), false);
  assert.equal(source.includes("matchValueHash"), false);
  assert.equal(source.includes("Arbeidslisten krever persistence-flagget"), true);
});

test("Lead Intelligence worklist auto-loads and can activate a saved buyer profile for matching", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("useEffect"), true);
  assert.equal(source.includes("void loadWorklist();"), true);
  assert.equal(source.includes("activeWorklistItem"), true);
  assert.equal(source.includes("setActiveWorklistItem(item);"), true);
  assert.equal(source.includes("lead-intelligence-property-match"), true);
  assert.equal(source.includes("lead-intelligence-active-profile"), true);
  assert.equal(source.includes("scrollIntoView"), true);
  assert.equal(source.includes("Ingen match-preview kjørt for denne lagrede profilen ennå."), false);
  assert.equal(source.includes('propertyMatchResult ? "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : "lg:grid-cols-1"'), true);
  assert.equal(source.includes("Tomt felt bruker automatisk søk i eksisterende eiendommer."), true);
  assert.equal(source.includes("Shortlist {shortlistSaveResult.result.shortlistId}"), true);
  assert.equal(source.includes("Neste steg: presentasjons- og e-postutkast"), true);
  assert.equal(source.includes("Lager et internt draft fra lagret shortlist."), true);
  assert.equal(source.includes("createdContact: false"), true);
  assert.equal(source.includes("emailSent: false"), true);
  assert.equal(source.includes("propertyMatchingStarted: false"), true);
});

test("Inventory can open a property detail modal from Lead Intelligence internal links", async () => {
  const source = await readFile(inventoryPath, "utf8");

  assert.equal(source.includes("openedPropertyFromQueryRef"), true);
  assert.equal(source.includes('params.get("propertyId")'), true);
  assert.equal(source.includes('params.get("propertyRef")'), true);
  assert.equal(source.includes("setShowDetailModal(property);"), true);
  assert.equal(source.includes("setDetailSlide(0);"), true);
});

test("Lead Intelligence CRM context is read-only and safe", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("loadCrmContext"), true);
  assert.equal(source.includes("CRM-kontekst"), true);
  assert.equal(source.includes("Read-only kontekst fra eksisterende kontaktpipeline"), true);
  assert.equal(source.includes("Ingen eksisterende CRM-kontekst funnet"), true);
  assert.equal(source.includes("Sideeffekter: kontakter opprettet nei"), true);
  assert.equal(source.includes("matchValueHash"), false);
});

test("Lead Intelligence property match preview is explicit and non-persistent", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("propertyMatchingEnabled"), true);
  assert.equal(source.includes("REALTYFLOW_PROPERTY_MATCHING_ENABLED=true"), true);
  assert.equal(source.includes("N8513"), true);
  assert.equal(source.includes("propertyReferences"), true);
  assert.equal(source.includes("Finn aktuelle eiendommer automatisk"), true);
  assert.equal(source.includes("autoDiscover: true"), true);
  assert.equal(source.includes("saveShortlistDraft"), true);
  assert.equal(source.includes("selectedShortlistItems"), true);
  assert.equal(source.includes("Foretrukne områder"), true);
  assert.equal(source.includes("Fleksibel på område"), true);
  assert.equal(source.includes("textToList(value)"), true);
  assert.equal(source.includes("Valgfritt. Maks 20 eksplisitte eiendomsreferanser"), true);
  assert.equal(source.includes("Aktuelle"), true);
  assert.equal(source.includes("Ingen av de valgte eiendommene er aktuelle uten manuell vurdering."), true);
  assert.equal(source.includes("Manuell vurdering"), true);
  assert.equal(source.includes("Aktuell"), true);
  assert.equal(source.includes("Kanskje"), true);
  assert.equal(source.includes("Må undersøkes"), true);
  assert.equal(source.includes("risiko/avvik blir lagret sammen med shortlist-utkastet"), true);
  assert.equal(source.includes("Matchpreviewen lagres ikke; shortlist-utkast lagres bare etter"), true);
  assert.equal(source.includes("Det oppretter ikke presentasjon, e-post, lead eller kontakt."), true);
  assert.equal(source.includes("Dette er bare en preview basert på shortlist-utkastet."), true);
  assert.equal(source.includes("Kundens behov"), true);
  assert.equal(source.includes("Før videre deling må dette avklares"), true);
  assert.equal(source.includes("Boligkort"), true);
  assert.equal(source.includes("Kortene er et internt utkast"), true);
  assert.equal(source.includes("Presentasjonsutkast lagret som draft uten eksterne sideeffekter."), true);
  assert.equal(source.includes("Rediger e-postutkast lokalt"), true);
  assert.equal(source.includes("Endringene lagres ikke i databasen"), true);
  assert.equal(source.includes("editableEmailSubject"), true);
  assert.equal(source.includes("editableEmailBody"), true);
  assert.equal(source.includes("Kopier tekst"), true);
  assert.equal(source.includes("Kopier HTML"), true);
  assert.equal(source.includes("HTML-versjon"), true);
  assert.equal(source.includes("Lagret HTML-utkast kopiert."), true);
  assert.equal(source.includes("Dette er kun et draft-preview. Det finnes ingen send-knapp i denne fasen."), true);
  assert.equal(source.includes("Se boligen på nettsiden:"), true);
  assert.equal(source.includes("Boliglenke mangler i systemet og må legges inn før utkastet sendes til kunden."), true);
  assert.equal(source.includes("Åpne boligside for"), true);
  assert.equal(source.includes("focus:ring-2 focus:ring-primary-500/70"), true);
  assert.equal(source.includes("Presentasjon publisert: nei"), true);
  assert.equal(source.includes("Ingen e-post er sendt"), true);
  assert.equal(source.includes("Matcher lagret: nei"), true);
  assert.equal(source.includes("Shortlist opprettet: nei"), false);
  assert.equal(source.includes("propertyMatchingStarted: true"), false);
});

test("Lead Intelligence match review decisions are local-only preview state", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("type MatchReviewDecision"), true);
  assert.equal(source.includes("matchReviewDecisions"), true);
  assert.equal(source.includes("setMatchReviewDecisions({});"), true);
  assert.equal(source.includes("setMatchReviewDecisions((current) =>"), true);
  assert.equal(source.includes("value={reviewDecision}"), true);
  assert.equal(source.includes("Manuell vurdering overstyrer ikke"), false);
  assert.equal(source.includes("presentationCreated: false"), true);
  assert.equal(source.includes("matchesPersisted: true"), false);
});

test("Lead Intelligence preview clears stale candidates before review save", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("const clearContactCandidates = () =>"), true);
  assert.equal(source.includes("setContactCandidatesLoaded(false);"), true);
  assert.equal(source.includes("setContactCandidates([]);"), true);
  assert.equal(source.includes("setSelectedContactId(null);"), true);
  assert.equal(source.includes("          contactCandidates,\n          reviewedCriteria"), false);
});

test("Lead Intelligence preview distinguishes not-loaded and empty contact candidate lookup", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("Ingen kontaktkandidater hentet ennå."), true);
  assert.equal(
    source.includes("Kandidatoppslag fullført. Ingen matchende kontaktkandidater funnet."),
    true,
  );
  assert.equal(source.includes("kontaktkandidat{contactCandidates.length === 1"), true);
});

test("Lead Intelligence preview does not expose contact lookup hashes", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("matchValueHash"), false);
});

test("Lead Intelligence preview sends stable criterion fingerprints instead of array indexes", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("criterionReviewFingerprint"), true);
  assert.equal(source.includes("fingerprint: criterion.fingerprint"), true);
  assert.equal(source.includes("index: criterion.index"), false);
});

test("Lead Intelligence preview surfaces idempotent duplicate saves clearly", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("idempotencySeed: response.correlationId"), true);
  assert.equal(source.includes("Identisk review var allerede lagret."), true);
  assert.equal(source.includes("Ny lagring:"), true);
  assert.equal(source.includes("Duplicate:"), true);
  assert.equal(source.includes("Conflict:"), true);
});

test("Lead Intelligence preview clears stale save results when reviewed payload changes", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("const clearContactCandidates = () =>"), true);
  assert.equal(source.includes("setSaveError(null);"), true);
  assert.equal(source.includes("setSaveResult(null);"), true);
  assert.equal(source.includes("const updateCriterionReview = "), true);
  assert.equal(source.includes("setSource(event.target.value as Source);"), true);
  assert.equal(source.includes("setLanguage(value);"), true);
  assert.equal(source.includes("setContactDecision(\"connect_existing\");"), true);
});

test("Lead Intelligence preview surfaces safe review diagnostics", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("saveError.details"), true);
  assert.equal(source.includes("prettyJson(saveError.details)"), true);
});

test("Lead Intelligence preview explains duplicate and conflict review saves", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("saveError.code === \"REVIEW_CONFLICT\""), true);
  assert.equal(source.includes("Systemet har ikke"), true);
  assert.equal(source.includes("overskrevet buyer profile eller kriterier"), true);
  assert.equal(source.includes("Ingen nye rader ble opprettet."), true);
  assert.equal(source.includes("samme intake, analyse og buyer profile"), true);
});

test("Lead Intelligence preview keeps connect_existing behind a server-side gate", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("connectExistingEnabled"), true);
  assert.equal(source.includes("Kandidatoppslag er kun read-only nå."), true);
  assert.equal(source.includes("setContactDecision(\"connect_existing\");"), true);
});

test("Lead Intelligence preview disables persistence actions when persistence is off", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.equal(source.includes("persistenceEnabled"), true);
  assert.equal(source.includes("Lagring er deaktivert i dette miljøet."), true);
  assert.equal(source.includes("Kontaktkandidatoppslag er deaktivert sammen med persistence."), true);
  assert.equal(source.includes("ingen intake eller buyer profile skrives"), true);
  assert.equal(source.includes("!persistenceEnabled"), true);
});
