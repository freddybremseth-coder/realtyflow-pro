export type NexusLifecyclePhase =
  | "awareness"
  | "engagement"
  | "qualification"
  | "consideration"
  | "conversion"
  | "delivery"
  | "retention";

export type BusinessPipelineId =
  | "real_estate_sales"
  | "publishing"
  | "ai_products_services"
  | "expert_advisory"
  | "product_commerce"
  | "creator_media";

export interface BusinessPipelineStage {
  id: string;
  label: string;
  phase: NexusLifecyclePhase;
  objective: string;
  defaultNextAction: string;
  keySignals: readonly string[];
  terminal?: boolean;
}

export interface BusinessPipelineDefinition {
  id: BusinessPipelineId;
  name: string;
  customerLabel: string;
  opportunityLabel: string;
  successEvent: string;
  valueModel: "transaction" | "unit_sale" | "subscription_or_project" | "professional_fee" | "commerce" | "audience";
  stages: readonly BusinessPipelineStage[];
}

export interface BrandBusinessBinding {
  brandId: string;
  pipelineId: BusinessPipelineId;
  role: "commercial" | "umbrella" | "audience";
  note: string;
}

export const BUSINESS_PIPELINES: readonly BusinessPipelineDefinition[] = [
  {
    id: "real_estate_sales",
    name: "Real estate sales",
    customerLabel: "Kjøper",
    opportunityLabel: "Boligmulighet",
    successEvent: "Reservasjon / gjennomført boligkjøp",
    valueModel: "transaction",
    stages: [
      { id: "new_lead", label: "Ny lead", phase: "engagement", objective: "Få kontakt og forstå hvorfor kunden henvender seg.", defaultNextAction: "Svar personlig og avklar område, budsjett, boligtype og tidslinje.", keySignals: ["inbound_lead", "reply", "phone_reached"] },
      { id: "qualified_buyer", label: "Kvalifisert kjøper", phase: "qualification", objective: "Bekreft kjøpskraft, krav og beslutningsprosess.", defaultNextAction: "Gjør kjøperprofilen komplett og avklar finansiering, timing og must-haves.", keySignals: ["budget_confirmed", "timeline_confirmed", "financing_confirmed"] },
      { id: "property_matching", label: "Boligmatching", phase: "consideration", objective: "Finne relevante boliger med dokumenterbar match.", defaultNextAction: "Velg 3–5 kvalitetssikrede boliger og forklar hvorfor de matcher.", keySignals: ["property_views", "shortlist", "preference_update"] },
      { id: "viewing", label: "Visning", phase: "consideration", objective: "Flytte kunden fra interesse til konkret beslutningsgrunnlag.", defaultNextAction: "Bekreft visningsplan og avklar viktigste innsigelser etter hver bolig.", keySignals: ["viewing_booked", "travel_planned", "repeat_property_view"] },
      { id: "negotiation", label: "Forhandling", phase: "conversion", objective: "Fjerne siste beslutningshindre og lande vilkår.", defaultNextAction: "Avklar pris, vilkår og konkret neste steg mot reservasjon.", keySignals: ["offer", "reservation_interest", "proof_of_funds"] },
      { id: "reserved", label: "Reservert", phase: "delivery", objective: "Sikre trygg overgang til closing.", defaultNextAction: "Følg dokumenter, betalinger, advokat og closing-plan til gjennomføring.", keySignals: ["reservation_signed", "deposit_paid", "closing_started"] },
      { id: "completed", label: "Gjennomført", phase: "retention", objective: "Bevare relasjonen og skape anbefalinger/ettermarked.", defaultNextAction: "Følg opp etter overtakelse og be om anbefaling når kunden er fornøyd.", keySignals: ["completion", "handover", "referral"] , terminal: true},
    ],
  },
  {
    id: "publishing",
    name: "Books & publishing",
    customerLabel: "Leser",
    opportunityLabel: "Bokinteresse",
    successEvent: "Boksalg / katalogkjøp / langsiktig leser",
    valueModel: "unit_sale",
    stages: [
      { id: "discovered", label: "Oppdaget", phase: "awareness", objective: "Få riktig bok foran riktig leser.", defaultNextAction: "Vis bokens tydelige løfte, tema og hvem den passer for.", keySignals: ["impression", "search_visit", "series_discovery"] },
      { id: "sample_engaged", label: "Prøvelest", phase: "engagement", objective: "Bygge nok interesse og tillit til at leseren vil videre.", defaultNextAction: "Fremhev prøvekapittel, omtale eller den sterkeste relevante delen av boken.", keySignals: ["sample_read", "book_page_visit", "description_engagement"] },
      { id: "purchase_intent", label: "Kjøpsinteresse", phase: "consideration", objective: "Redusere friksjon mellom interesse og kjøp.", defaultNextAction: "Gjør riktig format, butikk og neste bok i serien tydelig.", keySignals: ["retailer_click", "buy_button", "wishlist"] },
      { id: "purchased", label: "Kjøpt", phase: "conversion", objective: "Konvertere enkeltkjøp til faktisk lesing og serieoppdagelse.", defaultNextAction: "Pek leseren mot neste relevante bok eller serie uten aggressivt salg.", keySignals: ["sale", "download", "order"] },
      { id: "reader_retention", label: "Tilbakevendende leser", phase: "retention", objective: "Bygge katalogverdi og langsiktig leserrelasjon.", defaultNextAction: "Anbefal neste relevante bok, serie eller nyhetsbrev basert på dokumentert interesse.", keySignals: ["repeat_purchase", "newsletter", "series_read"] },
    ],
  },
  {
    id: "ai_products_services",
    name: "AI products & services",
    customerLabel: "Prospekt",
    opportunityLabel: "AI-mulighet",
    successEvent: "Abonnement / prosjekt / pilot / produktkjøp",
    valueModel: "subscription_or_project",
    stages: [
      { id: "new_lead", label: "Ny interesse", phase: "engagement", objective: "Forstå problemet kunden faktisk vil løse.", defaultNextAction: "Avklar brukstilfelle, dagens arbeidsflyt og ønsket forretningsresultat.", keySignals: ["demo_request", "product_interest", "inbound_lead"] },
      { id: "qualified", label: "Kvalifisert", phase: "qualification", objective: "Bekrefte behov, beslutningstaker, budsjett og teknisk fit.", defaultNextAction: "Kvalifiser behov, beslutningstaker, systemlandskap og betalingsvilje.", keySignals: ["budget", "authority", "use_case_confirmed"] },
      { id: "discovery", label: "Discovery", phase: "consideration", objective: "Oversette problemet til konkret produkt-/tjenestefit.", defaultNextAction: "Dokumenter nåsituasjon, ønsket effekt, data/integrasjoner og suksesskriterier.", keySignals: ["discovery_call", "requirements", "workflow_shared"] },
      { id: "demo_or_solution", label: "Demo / løsning", phase: "consideration", objective: "Bevise relevans med riktig use case, ikke generisk AI-demo.", defaultNextAction: "Vis den løsningen som matcher kundens konkrete arbeidsflyt og mål.", keySignals: ["demo_completed", "prototype", "solution_review"] },
      { id: "proposal_or_pilot", label: "Tilbud / pilot", phase: "conversion", objective: "Gjøre scope, risiko, pris og neste steg tydelig.", defaultNextAction: "Send avgrenset tilbud eller pilot med målbare kriterier og klar beslutningsdato.", keySignals: ["proposal_sent", "pilot_requested", "commercial_review"] },
      { id: "won", label: "Kunde", phase: "delivery", objective: "Levere verdi og få løsningen i faktisk bruk.", defaultNextAction: "Onboard, mål bruk/resultat og fjern blokkeringer tidlig.", keySignals: ["contract_signed", "subscription_started", "onboarding"] },
      { id: "expand", label: "Utvidelse / retention", phase: "retention", objective: "Beholde kunden og utvide når verdi er dokumentert.", defaultNextAction: "Bruk faktisk resultat og bruksmønster til å foreslå relevant neste steg.", keySignals: ["renewal", "usage_growth", "upsell_fit"] },
    ],
  },
  {
    id: "expert_advisory",
    name: "Expert advisory",
    customerLabel: "Klient",
    opportunityLabel: "Rådgivningsoppdrag",
    successEvent: "Booket / levert rådgivningsoppdrag",
    valueModel: "professional_fee",
    stages: [
      { id: "inquiry", label: "Henvendelse", phase: "engagement", objective: "Forstå hva klienten trenger hjelp til.", defaultNextAction: "Avklar problem, mål, tidslinje og hva klienten forventer av rådgivning.", keySignals: ["contact", "advisory_lead", "referral"] },
      { id: "fit_check", label: "Fit check", phase: "qualification", objective: "Avgjøre om oppdraget passer kompetanse, kapasitet og økonomi.", defaultNextAction: "Bekreft fit, beslutningstaker, ønsket resultat og realistisk scope.", keySignals: ["qualified_need", "budget", "decision_maker"] },
      { id: "discovery_call", label: "Rådgivningssamtale", phase: "consideration", objective: "Forstå situasjonen nok til å definere riktig oppdrag.", defaultNextAction: "Gjennomfør discovery og oppsummer problem, analysebehov og anbefalt retning.", keySignals: ["meeting_booked", "discovery_complete", "documents_received"] },
      { id: "scope_defined", label: "Scope definert", phase: "consideration", objective: "Gjøre leveranse og avgrensning tydelig.", defaultNextAction: "Definer leveranse, ansvar, tidslinje og hva som ikke inngår.", keySignals: ["scope_agreed", "deliverables_defined"] },
      { id: "proposal", label: "Tilbud", phase: "conversion", objective: "Få en tydelig ja/nei-beslutning på oppdraget.", defaultNextAction: "Send konkret tilbud med leveranse, honorar og beslutningsdato.", keySignals: ["proposal_sent", "commercial_discussion"] },
      { id: "booked", label: "Booket", phase: "delivery", objective: "Levere avtalt rådgivning med tydelig fremdrift.", defaultNextAction: "Start leveransen, avtal milepæler og hold klienten oppdatert.", keySignals: ["accepted", "invoice", "kickoff"] },
      { id: "completed", label: "Levert", phase: "retention", objective: "Sikre effekt, oppfølging og mulig videre samarbeid.", defaultNextAction: "Følg opp resultat, dokumenter læring og avklar eventuelt neste behov.", keySignals: ["delivery_complete", "followup", "referral"] , terminal: true},
    ],
  },
  {
    id: "product_commerce",
    name: "Product commerce",
    customerLabel: "Kunde",
    opportunityLabel: "Produktinteresse",
    successEvent: "Produktkjøp / gjenkjøp",
    valueModel: "commerce",
    stages: [
      { id: "discovered", label: "Oppdaget", phase: "awareness", objective: "Skape relevant produktoppdagelse.", defaultNextAction: "Vis produkt, opprinnelse og bruk på en troverdig måte.", keySignals: ["impression", "website_visit"] },
      { id: "product_interest", label: "Produktinteresse", phase: "engagement", objective: "Gjøre produktfordel og anvendelse forståelig.", defaultNextAction: "Svar på produktspørsmål og gjør kvalitet, bruk og opprinnelse tydelig.", keySignals: ["product_view", "question", "newsletter"] },
      { id: "purchase_intent", label: "Kjøpsintensjon", phase: "consideration", objective: "Redusere kjøpsfriksjon.", defaultNextAction: "Gjør tilgjengelighet, format, pris og kjøpsvei tydelig.", keySignals: ["cart", "checkout", "order_question"] },
      { id: "purchased", label: "Kjøpt", phase: "conversion", objective: "Levere korrekt ordre og god kundeopplevelse.", defaultNextAction: "Sikre levering og relevant produktinformasjon etter kjøpet.", keySignals: ["order", "payment"] },
      { id: "repeat_customer", label: "Gjenkjøp", phase: "retention", objective: "Bygge lojalitet uten irrelevant mas.", defaultNextAction: "Bruk tidligere kjøp til relevant oppfølging, gjenkjøp eller sesonginformasjon.", keySignals: ["repeat_order", "review", "subscription"] },
    ],
  },
  {
    id: "creator_media",
    name: "Creator & media",
    customerLabel: "Publikum",
    opportunityLabel: "Publikumsengasjement",
    successEvent: "Seer / følger / abonnent / tilbakevendende publikum",
    valueModel: "audience",
    stages: [
      { id: "discovered", label: "Oppdaget", phase: "awareness", objective: "Få innhold oppdaget av riktig publikum.", defaultNextAction: "Distribuer det sterkeste relevante innholdet i riktig kanal og format.", keySignals: ["impression", "search", "recommendation"] },
      { id: "engaged", label: "Engasjert", phase: "engagement", objective: "Få publikum til å se, lytte eller reagere videre.", defaultNextAction: "Følg opp format og temaer som faktisk holder på oppmerksomheten.", keySignals: ["view", "watch_time", "engagement"] },
      { id: "subscribed", label: "Følger / abonnent", phase: "conversion", objective: "Konvertere enkeltengasjement til varig publikum.", defaultNextAction: "Gjør neste relevante innhold og abonnement/follow naturlig synlig.", keySignals: ["subscribe", "follow"] },
      { id: "returning", label: "Tilbakevendende publikum", phase: "retention", objective: "Bygge katalog- og publikumsverdi over tid.", defaultNextAction: "Prioriter serier, katalog og innhold som skaper tilbakevendende bruk.", keySignals: ["returning_viewer", "playlist", "repeat_engagement"] },
    ],
  },
] as const;

export const BRAND_BUSINESS_BINDINGS: readonly BrandBusinessBinding[] = [
  { brandId: "zeneco", pipelineId: "real_estate_sales", role: "commercial", note: "Boligsalg og buyer journey." },
  { brandId: "pinosoecolife", pipelineId: "real_estate_sales", role: "commercial", note: "Tomt/nybygg og buyer journey; lokale tilbud kan ha egne delsteg senere." },
  { brandId: "freddypublishing", pipelineId: "publishing", role: "commercial", note: "Bokkatalog, serier, samples og retail-konvertering." },
  { brandId: "chatgenius", pipelineId: "ai_products_services", role: "commercial", note: "AI/web/SaaS leads, demo, tilbud og abonnement/prosjekt." },
  { brandId: "freddyai", pipelineId: "ai_products_services", role: "commercial", note: "Nexus OS, RealtyFlow og fremtidige AI-produkter/tjenester." },
  { brandId: "freddyb", pipelineId: "expert_advisory", role: "umbrella", note: "Profesjonell ekspert-/rådgiverprofil. Cross-brand innhold må fortsatt rutes til underliggende commercial pipeline når tilbudet tilhører en annen business." },
  { brandId: "donaanna", pipelineId: "product_commerce", role: "commercial", note: "Mat/agri-produktinteresse, kjøp og gjenkjøp." },
  { brandId: "remasterfreddy", pipelineId: "creator_media", role: "audience", note: "Audience growth er ikke en tradisjonell salgs-pipeline." },
] as const;

export function businessPipelineDefinition(pipelineId: BusinessPipelineId) {
  return BUSINESS_PIPELINES.find((pipeline) => pipeline.id === pipelineId) ?? null;
}

export function businessPipelineForBrand(brandId: string) {
  const binding = BRAND_BUSINESS_BINDINGS.find((row) => row.brandId === brandId);
  if (!binding) return null;
  const pipeline = businessPipelineDefinition(binding.pipelineId);
  return pipeline ? { binding, pipeline } : null;
}

export function businessStage(pipelineId: BusinessPipelineId, stageId: string) {
  return businessPipelineDefinition(pipelineId)?.stages.find((stage) => stage.id === stageId) ?? null;
}

export function defaultBusinessNextAction(pipelineId: BusinessPipelineId, stageId: string) {
  return businessStage(pipelineId, stageId)?.defaultNextAction ?? null;
}
