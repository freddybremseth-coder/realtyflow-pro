export type LocalIndustryFaqItem = {
  question: string;
  answer: string;
};

export type LocalIndustryTemplateDefaults = {
  hero_title: string;
  hero_subtitle: string;
  intro_text: string;
  services: string[];
  products: string[];
  prices: string[];
  trust_points: string[];
  faq: LocalIndustryFaqItem[];
  call_to_action: string;
  contact_text: string;
  brand_color: string;
  secondary_color: string;
  accent_color: string;
  suggested_sections: string[];
};

export type LocalIndustryTemplate = {
  slug: string;
  name: string;
  category: string;
  description: string;
  strongKeywords: string[];
  supportingKeywords: string[];
  minimumScore?: number;
  defaults: LocalIndustryTemplateDefaults;
};

export type LocalIndustryProfile = {
  company_name?: string;
  title?: string;
  description?: string;
  summary?: string;
  services?: string[];
  products?: string[];
  prices?: string[];
  source_pages?: string[];
  recommended_template_slug?: string;
  detected_industry?: string;
  confidence_score?: number;
  template_detection?: Record<string, unknown>;
  [key: string]: unknown;
};

export type LocalIndustryClassification = {
  slug: string;
  name: string;
  score: number;
  confidence: "high" | "medium";
  reason: string;
  matchedKeywords: string[];
  strongMatches: string[];
  considered: Array<{ slug: string; score: number; matchedKeywords: string[] }>;
};

const OFFICE_IMAGES = [
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=80",
];

const HEALTH_IMAGES = [
  "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1551601651-2a8555f1a136?auto=format&fit=crop&w=1200&q=80",
];

const CRAFT_IMAGES = [
  "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80",
];

function template(
  input: Omit<LocalIndustryTemplate, "defaults"> & {
    defaults: Omit<LocalIndustryTemplateDefaults, "suggested_sections"> & { suggested_sections?: string[] };
  },
): LocalIndustryTemplate {
  return {
    ...input,
    defaults: {
      ...input.defaults,
      suggested_sections: input.defaults.suggested_sections || ["Hero", "Tjenester", "Hvorfor oss", "Priser", "FAQ", "Kontakt", "ChatGenius"],
    },
  };
}

export const LOCAL_INDUSTRY_TEMPLATES: LocalIndustryTemplate[] = [
  template({
    slug: "radgiver",
    name: "Rådgiver & konsulent",
    category: "professional",
    description: "For rådgivere, konsulenter, bedriftsutviklere og spesialister som selger kompetanse og møter.",
    strongKeywords: ["rådgiver", "rådgivning", "konsulent", "consulting", "bedriftsrådgivning", "strategirådgivning", "forretningsutvikling"],
    supportingKeywords: ["analyse", "strategi", "workshop", "sparring", "prosjektledelse", "lederutvikling"],
    defaults: {
      hero_title: "{companyName} gjør komplekse valg enklere",
      hero_subtitle: "Tydelig rådgivning, konkrete anbefalinger og en plan som kan settes ut i livet.",
      intro_text: "{companyName} hjelper virksomheter og privatkunder med å forstå situasjonen, velge riktig retning og komme videre med tryggere beslutninger.",
      services: ["Innledende behovsavklaring", "Strategi og handlingsplan", "Analyse og anbefalinger", "Prosjekt- og prosessledelse", "Workshop og lederstøtte", "Fast rådgivningsavtale"],
      products: ["Avklaringsmøte", "Strategiworkshop", "Rådgivningspakke", "Løpende sparring"],
      prices: ["Første avklaring kan tas digitalt", "Fastpris avtales for definerte leveranser", "Time- eller månedsavtale etter behov"],
      trust_points: ["Konkrete råd fremfor generelle formuleringer", "Tydelig scope, ansvar og neste steg", "Diskret behandling av informasjon", "Oppfølging som holder fremdriften oppe"],
      faq: [
        { question: "Hvordan starter et rådgivningsoppdrag?", answer: "Vi starter med en kort avklaring av mål, situasjon og ønsket resultat før omfang og pris avtales." },
        { question: "Kan rådgivningen gjennomføres digitalt?", answer: "Ja. Møter, workshops og oppfølging kan gjennomføres digitalt eller fysisk etter behov." },
        { question: "Får vi en konkret leveranse?", answer: "Oppdraget kan avsluttes med anbefalinger, prioriteringer, handlingsplan eller annen avtalt dokumentasjon." },
      ],
      call_to_action: "Book en avklaring",
      contact_text: "Fortell kort hva du ønsker å løse, så foreslår {companyName} et fornuftig første steg.",
      brand_color: "#2563eb",
      secondary_color: "#0f172a",
      accent_color: "#38bdf8",
      suggested_sections: ["Hero", "Kompetanse", "Tjenester", "Arbeidsmetode", "Resultater", "FAQ", "Kontakt", "ChatGenius"],
    },
  }),
  template({
    slug: "tannlege",
    name: "Tannlege & tannklinikk",
    category: "health",
    description: "Rolig og tillitsskapende klinikkmal med behandlinger, akuttbehov og timeforespørsel.",
    strongKeywords: ["tannlege", "tannklinikk", "dental", "tannbehandling", "tannhelse", "tannpleier", "implantat"],
    supportingKeywords: ["tannrens", "rotfylling", "krone", "bro", "akutt", "usynlig regulering", "undersøkelse"],
    defaults: {
      hero_title: "Trygg tannbehandling hos {companyName}",
      hero_subtitle: "Rolig oppfølging, tydelig informasjon og behandling tilpasset dine behov.",
      intro_text: "Hos {companyName} skal det være enkelt å bestille time, forstå behandlingsalternativene og vite hva som skjer videre.",
      services: ["Undersøkelse og røntgen", "Tannrens og forebygging", "Akutt tannbehandling", "Fyllinger og rotfylling", "Kroner, broer og implantater", "Estetisk tannbehandling"],
      products: ["Ordinær kontroll", "Akuttime", "Tannrens", "Behandlingsplan"],
      prices: ["Prisoverslag gis før større behandling", "Refusjon vurderes der vilkårene er oppfylt", "Akuttbehandling prises etter undersøkelse og behov"],
      trust_points: ["Tydelig forklaring før behandling", "Rolig oppfølging ved tannlegeskrekk", "Moderne utstyr og gode rutiner", "Oversiktlig behandlings- og prisplan"],
      faq: [
        { question: "Har dere hjelp ved akutte smerter?", answer: "Ta kontakt så tidlig som mulig. Klinikken vurderer behovet og finner første tilgjengelige løsning." },
        { question: "Kan jeg få prisoverslag først?", answer: "Ja. Ved større behandling får du informasjon om alternativer og forventet kostnad før oppstart." },
        { question: "Hva gjør jeg hvis jeg har tannlegeskrekk?", answer: "Si fra ved bestilling. Da kan timen planlegges med ekstra tid, forklaring og pauser." },
      ],
      call_to_action: "Bestill tannlegetime",
      contact_text: "Beskriv kort om du ønsker kontroll, behandling eller akuttime, så følger {companyName} deg opp.",
      brand_color: "#0f766e",
      secondary_color: "#134e4a",
      accent_color: "#5eead4",
      suggested_sections: ["Hero", "Behandlinger", "Akutthjelp", "Trygghet", "Priser", "FAQ", "Kontakt", "ChatGenius"],
    },
  }),
  template({
    slug: "terapeut",
    name: "Terapeut & samtalebehandler",
    category: "health",
    description: "Varm og diskret mal for psykolog, terapeut, familieterapeut, coach og samtalebehandler.",
    strongKeywords: ["terapeut", "psykolog", "psykoterapeut", "familieterapeut", "samtaleterapi", "parterapi", "traumeterapi"],
    supportingKeywords: ["samtaler", "angst", "stress", "utbrenthet", "relasjoner", "coaching", "veiledning", "mental helse"],
    defaults: {
      hero_title: "Et trygt sted å sortere det som er vanskelig",
      hero_subtitle: "Samtaler med ro, respekt og tydelig retning hos {companyName}.",
      intro_text: "{companyName} tilbyr et konfidensielt rom for refleksjon, endring og støtte – fysisk eller digitalt.",
      services: ["Individuelle samtaler", "Par- og relasjonssamtaler", "Stress og utbrenthet", "Angst, uro og livsendringer", "Foreldre- og familiesamtaler", "Digitale konsultasjoner"],
      products: ["Førstegangssamtale", "Individuell time", "Parsamtale", "Digital konsultasjon"],
      prices: ["Pris og varighet oppgis før bestilling", "Avbestillingsvilkår fremgår av bekreftelsen", "Pakke eller fast oppfølging kan avtales"],
      trust_points: ["Konfidensiell og respektfull oppfølging", "Tydelige rammer for samtalene", "Ingen krav om å ha alle svar på forhånd", "Mulighet for digital oppfølging"],
      faq: [
        { question: "Må jeg vite nøyaktig hva jeg trenger hjelp med?", answer: "Nei. Første samtale kan brukes til å sortere situasjonen og finne ut hva som vil være nyttig videre." },
        { question: "Tilbys digitale samtaler?", answer: "Ja, dersom dette passer temaet og dine behov kan oppfølgingen gjennomføres digitalt." },
        { question: "Er samtalene konfidensielle?", answer: "Ja. Taushet, personvern og tydelige rammer er en grunnleggende del av tilbudet." },
      ],
      call_to_action: "Bestill en samtale",
      contact_text: "Du trenger ikke skrive mye. Fortell kort hva du ønsker støtte til, så svarer {companyName} med mulige tider og neste steg.",
      brand_color: "#7c3aed",
      secondary_color: "#312e81",
      accent_color: "#c4b5fd",
      suggested_sections: ["Hero", "Samtaletilbud", "Om terapeuten", "Slik foregår det", "Praktisk info", "FAQ", "Kontakt"],
    },
  }),
  template({
    slug: "bilverksted",
    name: "Bilverksted & bilservice",
    category: "auto",
    description: "Verkstedmal med service, EU-kontroll, feilsøking og tydelig timeforespørsel.",
    strongKeywords: ["bilverksted", "verksted", "bilservice", "eu kontroll", "eu-kontroll", "mekaniker", "autoservice"],
    supportingKeywords: ["oljeskift", "bremser", "diagnose", "feilsøking", "registerreim", "aircondition", "ac service", "reparasjon"],
    defaults: {
      hero_title: "Bilservice uten unødvendig venting",
      hero_subtitle: "Service, EU-kontroll og reparasjoner med tydelig beskjed før arbeidet starter.",
      intro_text: "{companyName} hjelper bileiere med vedlikehold, feilsøking og reparasjoner – med enkel timeforespørsel og ryddig kommunikasjon.",
      services: ["EU-kontroll", "Service og oljeskift", "Bremser og understell", "Diagnose og feilsøking", "AC- og klimaanlegg", "Reparasjon og vedlikehold"],
      products: ["EU-kontroll", "Liten og stor service", "Bremsekontroll", "Diagnose"],
      prices: ["Prisoverslag gis før større reparasjoner", "Service prises etter bilmodell og serviceprogram", "Feilsøking avtales før videre arbeid"],
      trust_points: ["Ingen større arbeid uten avklaring", "Tydelig prisoverslag og anbefaling", "Deler og arbeid dokumenteres", "Enkel kontakt om status på bilen"],
      faq: [
        { question: "Kan jeg få pris før dere reparerer bilen?", answer: "Ja. Etter kontroll eller diagnose får du beskjed om anbefalt arbeid og pris før større reparasjoner utføres." },
        { question: "Hvilken informasjon bør jeg sende inn?", answer: "Oppgi registreringsnummer, kilometerstand, ønsket tjeneste og eventuelle symptomer." },
        { question: "Tilbyr dere EU-kontroll?", answer: "Dersom verkstedet er godkjent for EU-kontroll kan du sende forespørsel med registreringsnummer og ønsket tidspunkt." },
      ],
      call_to_action: "Bestill verkstedtime",
      contact_text: "Oppgi registreringsnummer og hva bilen trenger hjelp med, så svarer {companyName} med forslag til tid og neste steg.",
      brand_color: "#dc2626",
      secondary_color: "#111827",
      accent_color: "#fb923c",
      suggested_sections: ["Hero", "Verkstedtjenester", "EU-kontroll", "Slik jobber vi", "Priser", "FAQ", "Timeforespørsel", "ChatGenius"],
    },
  }),
  template({
    slug: "handverker",
    name: "Håndverker & byggservice",
    category: "trades",
    description: "Fleksibel mal for lokale håndverkere, byggservice, oppussing og mindre entreprenører.",
    strongKeywords: ["håndverker", "handverker", "byggservice", "oppussing", "rehabilitering", "tømrer", "tomrer", "snekkerfirma"],
    supportingKeywords: ["tilbygg", "terrasse", "renovering", "montering", "befaring", "vedlikehold", "innvendig", "utvendig"],
    defaults: {
      hero_title: "Solid håndverk fra første befaring",
      hero_subtitle: "Oppussing, vedlikehold og byggearbeid med tydelig avtale og ryddig fremdrift.",
      intro_text: "{companyName} hjelper privat- og bedriftskunder med små og store håndverksoppdrag i Larvik, Sandefjord og nærliggende områder.",
      services: ["Oppussing og rehabilitering", "Terrasse og uteområder", "Innvendig byggarbeid", "Dører, vinduer og montering", "Vedlikehold og reparasjoner", "Befaring og pristilbud"],
      products: ["Gratis behovsavklaring", "Befaring", "Fastpristilbud", "Service- og vedlikeholdsavtale"],
      prices: ["Pris etter befaring og omfang", "Fastpris avtales før oppstart der det er mulig", "Materialer og tilvalg spesifiseres i tilbudet"],
      trust_points: ["Tydelig avtale om omfang og pris", "Bilder og referanser fra utførte jobber", "Ryddig fremdrift og kommunikasjon", "Dokumentasjon der arbeidet krever det"],
      faq: [
        { question: "Kommer dere på befaring?", answer: "Ja. For oppdrag som krever måling eller vurdering avtales befaring før endelig tilbud." },
        { question: "Kan jeg få fastpris?", answer: "Når omfang og materialvalg er tydelig definert kan fastpris eller prisramme avtales før oppstart." },
        { question: "Tar dere mindre oppdrag?", answer: "Beskriv jobben og ønsket tidspunkt, så vurderer {companyName} kapasitet og riktig løsning." },
      ],
      call_to_action: "Bestill befaring",
      contact_text: "Send noen linjer om jobben, gjerne med bilder og adresse, så følger {companyName} opp med spørsmål eller forslag til befaring.",
      brand_color: "#ea580c",
      secondary_color: "#292524",
      accent_color: "#fbbf24",
      suggested_sections: ["Hero", "Tjenester", "Referanser", "Slik jobber vi", "Befaring", "FAQ", "Kontakt", "ChatGenius"],
    },
  }),
  template({
    slug: "tak-fasade",
    name: "Tak, fasade & byggeprodukter",
    category: "trades",
    description: "For takprodusenter, taktekking, beslag, takstoler, fasade og leverandører av byggeprodukter.",
    strongKeywords: ["takprodusent", "taktekking", "taktekker", "takstein", "takplater", "takstol", "takstoler", "beslag", "fasadeplater", "roofing"],
    supportingKeywords: ["tak", "fasade", "byggprodukter", "produksjon", "produsent", "leverandør", "leverandor", "montasje", "undertak"],
    defaults: {
      hero_title: "Tak og fasadeløsninger bygget for norsk klima",
      hero_subtitle: "Produkter, rådgivning og levering til bolig, næring og profesjonelle byggeprosjekter.",
      intro_text: "{companyName} presenterer produkter, systemer, dokumentasjon og prosjektstøtte på en måte som gjør det enkelt å velge riktig løsning.",
      services: ["Rådgivning om tak- og fasadeløsninger", "Produksjon og levering", "Prosjektering og mengdeberegning", "Tilbehør, beslag og komplette systemer", "Dokumentasjon og produktdata", "Tilbud til privat- og proffmarked"],
      products: ["Takplater og taksystemer", "Takstein og tilbehør", "Beslag og detaljer", "Fasadeprodukter"],
      prices: ["Tilbud basert på mål, produkt og mengde", "Prosjektpris for entreprenør og forhandler", "Frakt og levering spesifiseres separat"],
      trust_points: ["Produktkompetanse og tydelig dokumentasjon", "Løsninger tilpasset norsk vær", "Råd om komplett system – ikke bare enkeltprodukt", "Forutsigbar produksjon og levering"],
      faq: [
        { question: "Hjelper dere med beregning av mengde?", answer: "Ja. Send tegninger, mål eller prosjektinformasjon, så kan riktig produkt og mengde vurderes." },
        { question: "Leverer dere til byggeplass?", answer: "Leveringsmåte, frakt og tidspunkt avtales ut fra produkt, mengde og adresse." },
        { question: "Finnes produktdokumentasjon tilgjengelig?", answer: "Relevant dokumentasjon, monteringsinformasjon og tekniske data kan legges til produkt- eller prosjektsiden." },
      ],
      call_to_action: "Be om prosjekttilbud",
      contact_text: "Send mål, tegninger eller en kort prosjektbeskrivelse, så hjelper {companyName} med produktvalg, mengde og tilbud.",
      brand_color: "#334155",
      secondary_color: "#0f172a",
      accent_color: "#f97316",
      suggested_sections: ["Hero", "Produkter", "Systemløsninger", "For proffmarkedet", "Dokumentasjon", "Prosjekter", "FAQ", "Forespørsel"],
    },
  }),
  template({
    slug: "regnskapsforer",
    name: "Regnskapsfører & økonomitjenester",
    category: "professional",
    description: "For regnskapskontor, lønn, fakturering, årsoppgjør og økonomisk rådgivning.",
    strongKeywords: ["regnskapsfører", "regnskapsforer", "regnskapskontor", "bokføring", "bokforing", "årsoppgjør", "arsoppgjor", "lønnskjøring"],
    supportingKeywords: ["regnskap", "lønn", "mva", "fakturering", "økonomirådgivning", "avstemming", "a melding"],
    defaults: {
      hero_title: "Bedre oversikt over tallene – mindre administrasjon",
      hero_subtitle: "Regnskap, lønn og rapportering med faste rutiner og et tilgjengelig kontaktpunkt.",
      intro_text: "{companyName} hjelper små og mellomstore bedrifter med løpende regnskap, frister og styringsinformasjon.",
      services: ["Løpende bokføring", "Lønn og A-melding", "Fakturering og oppfølging", "MVA og avstemming", "Årsoppgjør og rapportering", "Økonomisk rådgivning"],
      products: ["Regnskapspakke for småbedrift", "Lønnspakke", "Årsoppgjør", "Økonomirapportering"],
      prices: ["Fast månedspris etter bilagsmengde og behov", "Oppstart og systembytte avtales separat", "Tilleggstjenester prises før utførelse"],
      trust_points: ["Autorisasjon og tydelige ansvarsforhold", "Kontroll på frister og avstemminger", "Sikker dokumentflyt", "Rapporter som er forståelige for ledelsen"],
      faq: [
        { question: "Kan dere overta fra et annet regnskapskontor?", answer: "Ja. Overføringen planlegges med tilgang, saldobalanse, dokumentasjon og tydelig skjæringsdato." },
        { question: "Tilbyr dere fastpris?", answer: "Mange oppdrag kan prises per måned når omfang, bilagsmengde og tjenester er avklart." },
        { question: "Hvilke systemer støtter dere?", answer: "Oppgi hvilket økonomisystem dere bruker, så avklares integrasjoner, tilgang og arbeidsdeling." },
      ],
      call_to_action: "Be om regnskapstilbud",
      contact_text: "Fortell om selskapsform, ansatte, bilagsmengde og dagens system, så kan {companyName} foreslå riktig oppsett.",
      brand_color: "#0369a1",
      secondary_color: "#0c4a6e",
      accent_color: "#7dd3fc",
    },
  }),
  template({
    slug: "fotograf",
    name: "Fotograf & visuelt studio",
    category: "creative",
    description: "Bildeorientert mal for fotograf, videoprodusent og kreativt studio med portefølje og booking.",
    strongKeywords: ["fotograf", "fotostudio", "bryllupsfotograf", "bedriftsfoto", "videoproduksjon", "portrettfotograf"],
    supportingKeywords: ["foto", "video", "portrett", "bryllup", "produktfoto", "drone", "content", "studio"],
    defaults: {
      hero_title: "Bilder som føles – og fungerer",
      hero_subtitle: "Foto og visuelt innhold for mennesker, bedrifter og øyeblikk som fortjener mer enn standardbilder.",
      intro_text: "{companyName} planlegger, fotograferer og leverer visuelt innhold med tydelig stil og avtalt bruksområde.",
      services: ["Portrett og profilbilder", "Bedrifts- og miljøfoto", "Bryllup og arrangement", "Produkt- og matfoto", "Bolig- og interiørfoto", "Video og innholdsproduksjon"],
      products: ["Portrettpakke", "Bedriftspakke", "Bryllupspakke", "Innholdsdag"],
      prices: ["Pakkepris etter varighet og leveranse", "Tillegg for reise, studio eller utvidet bruksrett avtales", "Bedriftstilbud tilpasses antall bilder og bruksområder"],
      trust_points: ["Tydelig brief og forventningsavklaring", "Profesjonell utvelgelse og etterbehandling", "Avklart leveringstid og bruksrett", "Trygg regi foran kamera"],
      faq: [
        { question: "Hvor raskt leveres bildene?", answer: "Leveringstid avtales før fotograferingen og avhenger av oppdrag, utvalg og etterbehandling." },
        { question: "Får vi hjelp med planlegging?", answer: "Ja. Brief, sted, uttrykk, klær, tidsplan og ønsket bruk av bildene avklares på forhånd." },
        { question: "Kan bedrifter få fast innholdsavtale?", answer: "Ja. Regelmessige fotograferinger eller innholdsdager kan avtales som fast leveranse." },
      ],
      call_to_action: "Sjekk ledig dato",
      contact_text: "Fortell hva bildene skal brukes til, ønsket dato og stil, så svarer {companyName} med forslag og pris.",
      brand_color: "#18181b",
      secondary_color: "#09090b",
      accent_color: "#f4f4f5",
      suggested_sections: ["Hero", "Portefølje", "Tjenester", "Pakker", "Arbeidsprosess", "FAQ", "Booking"],
    },
  }),
  template({
    slug: "veterinaer",
    name: "Veterinær & dyreklinikk",
    category: "health",
    description: "Trygg klinikkmal for smådyr, vaksine, undersøkelse, kirurgi og akutthenvendelser.",
    strongKeywords: ["veterinær", "veterinaer", "dyreklinikk", "dyrlege", "smådyrklinikk", "smadyrklinikk"],
    supportingKeywords: ["vaksine", "hund", "katt", "kjæledyr", "kirurgi", "akutt", "tannbehandling dyr"],
    defaults: {
      hero_title: "Trygg hjelp for dyret ditt",
      hero_subtitle: "Undersøkelse, forebygging og behandling med tydelig informasjon til deg som eier.",
      intro_text: "{companyName} gjør det enkelt å bestille time, beskrive symptomer og få råd om hva som bør skje videre.",
      services: ["Helsekontroll og vaksine", "Utredning av sykdom og smerte", "Tannbehandling", "Kirurgi og oppfølging", "Hud, ører og allergi", "Akutt vurdering"],
      products: ["Årlig helsekontroll", "Vaksine", "Tannkontroll", "Akuttime"],
      prices: ["Pris avhenger av undersøkelse og behandling", "Kostnadsoverslag gis før større inngrep", "Forsikring og direkteoppgjør avklares med klinikken"],
      trust_points: ["Tydelig informasjon før behandling", "Omsorgsfull håndtering av dyret", "Kostnadsoverslag ved større tiltak", "Oppfølging etter behandling"],
      faq: [
        { question: "Hva bør jeg oppgi ved bestilling?", answer: "Oppgi dyreart, alder, symptomer, varighet og om tilstanden har blitt raskt verre." },
        { question: "Kan jeg få kostnadsoverslag?", answer: "Ja. Etter nødvendig undersøkelse kan klinikken forklare alternativer og forventet kostnad." },
        { question: "Hva gjør jeg ved akutt behov?", answer: "Ring klinikken eller oppgitt vaktordning med en gang dersom dyret har pustevansker, sterke smerter eller alvorlig skade." },
      ],
      call_to_action: "Bestill veterinærtime",
      contact_text: "Beskriv dyret og symptomene kort, så hjelper {companyName} med riktig time eller anbefalt neste steg.",
      brand_color: "#15803d",
      secondary_color: "#14532d",
      accent_color: "#86efac",
    },
  }),
  template({
    slug: "hage-anlegg",
    name: "Hage, anlegg & uteområder",
    category: "trades",
    description: "For anleggsgartner, hageservice, steinlegging, grunnarbeid og vedlikehold av uteområder.",
    strongKeywords: ["anleggsgartner", "hageservice", "hagearbeid", "steinlegging", "belegningsstein", "graving", "grunnarbeid"],
    supportingKeywords: ["plen", "beskjæring", "beskjaering", "uteområde", "uteomrade", "drenering", "støttemur", "stottemur"],
    defaults: {
      hero_title: "Uteområder som fungerer – og ser bra ut",
      hero_subtitle: "Planlegging, grunnarbeid, stein og grøntanlegg for private og bedrifter.",
      intro_text: "{companyName} hjelper med å planlegge, bygge og vedlikeholde uteområder i Larvik, Sandefjord og resten av Vestfold.",
      services: ["Hageplanlegging og opparbeiding", "Grunnarbeid og drenering", "Steinlegging og støttemur", "Plen, planting og bed", "Beskjæring og hageservice", "Fast vedlikeholdsavtale"],
      products: ["Befaring", "Komplett uteområde", "Stein- og murarbeid", "Sesongvedlikehold"],
      prices: ["Pris etter befaring, areal og materialvalg", "Fastpris kan gis på tydelig definerte oppdrag", "Bortkjøring og masser spesifiseres i tilbudet"],
      trust_points: ["Riktig grunnarbeid før synlige overflater", "Tydelig plan for materialer og høyder", "Maskiner og kapasitet tilpasset oppdraget", "Ryddig avslutning og bortkjøring"],
      faq: [
        { question: "Trenger dere befaring?", answer: "Ja, de fleste uteprosjekter bør vurderes på stedet med høyder, adkomst, masser og ønsket resultat." },
        { question: "Tar dere både små og store oppdrag?", answer: "Send en kort beskrivelse og bilder, så vurderer {companyName} kapasitet og riktig løsning." },
        { question: "Kan dere stå for materialer og bortkjøring?", answer: "Dette kan inngå i tilbudet og spesifiseres sammen med mengder, levering og eventuell deponering." },
      ],
      call_to_action: "Bestill utebefaring",
      contact_text: "Send adresse, bilder og en kort beskrivelse av uteområdet, så tar {companyName} kontakt om befaring.",
      brand_color: "#4d7c0f",
      secondary_color: "#365314",
      accent_color: "#bef264",
    },
  }),
  template({
    slug: "interior-kjokken-bad",
    name: "Interiør, kjøkken & bad",
    category: "retail-service",
    description: "For kjøkkenstudio, bad, garderobe, fliser, interiør og prosjektbasert salg med befaring.",
    strongKeywords: ["kjøkkenstudio", "kjokkenstudio", "kjøkken", "kjokken", "baderom", "badrenovering", "garderobe", "interiørdesign"],
    supportingKeywords: ["fliser", "benkeplate", "innredning", "oppmåling", "oppmaling", "tegnetime", "showroom", "montering"],
    defaults: {
      hero_title: "Rom som er planlagt rundt livet ditt",
      hero_subtitle: "Kjøkken, bad og interiørløsninger fra idé og oppmåling til levering og montering.",
      intro_text: "{companyName} kombinerer produktvalg, tegning og prosjektoppfølging slik at kunden får en helhetlig løsning.",
      services: ["Tegnetime og behovsavklaring", "Oppmåling", "Kjøkken og garderobe", "Bad og baderomsinnredning", "Material- og fargevalg", "Levering og montering"],
      products: ["Kjøkkenløsninger", "Baderomsinnredning", "Garderobe", "Benkeplater og tilbehør"],
      prices: ["Pris etter tegning, mål og produktvalg", "Oppmåling og montering spesifiseres", "Finansiering eller betalingsplan kan presenteres der det tilbys"],
      trust_points: ["Én plan fra idé til levering", "Tydelig visualisering før bestilling", "Oppmåling reduserer feil", "Koordinering av levering og montering"],
      faq: [
        { question: "Kan vi bestille tegnetime?", answer: "Ja. Ta med mål, bilder og inspirasjon, så kan behov, stil og budsjett avklares." },
        { question: "Tilbyr dere oppmåling?", answer: "Oppmåling kan avtales før endelig bestilling for å kontrollere mål og tekniske forhold." },
        { question: "Kan dere levere montering?", answer: "Levering, montering og eventuell koordinering med andre fag avtales i tilbudet." },
      ],
      call_to_action: "Book tegnetime",
      contact_text: "Fortell hvilket rom du planlegger, ønsket stil og omtrentlige mål, så hjelper {companyName} deg videre.",
      brand_color: "#92400e",
      secondary_color: "#422006",
      accent_color: "#fcd34d",
      suggested_sections: ["Hero", "Inspirasjon", "Produkter", "Tegnetime", "Prosessen", "Prosjekter", "FAQ", "Kontakt"],
    },
  }),
  template({
    slug: "trening-helse",
    name: "Trening, PT & helse",
    category: "health-fitness",
    description: "For personlig trener, treningssenter, yoga, pilates og livsstilsoppfølging.",
    strongKeywords: ["personlig trener", "pt studio", "treningssenter", "yogastudio", "pilates", "coaching trening"],
    supportingKeywords: ["trening", "styrke", "mobilitet", "livsstil", "gruppeøkt", "gruppeokt", "kosthold", "oppfølging"],
    defaults: {
      hero_title: "Trening som passer kroppen og hverdagen din",
      hero_subtitle: "Personlig oppfølging, tydelig plan og progresjon du kan merke.",
      intro_text: "{companyName} hjelper medlemmer og kunder med å komme i gang, trene riktig og holde kontinuitet over tid.",
      services: ["Personlig trening", "Kartlegging og målsetting", "Styrke og mobilitet", "Gruppetimer", "Digital oppfølging", "Livsstils- og kostholdsveiledning"],
      products: ["Prøvetime", "PT-pakke", "Medlemskap", "Digital coaching"],
      prices: ["Prøvetime eller kartlegging etter avtale", "Pakkepris for flere PT-timer", "Medlemskap og gruppetimer presenteres tydelig"],
      trust_points: ["Plan tilpasset nivå og mål", "Teknikk og progresjon følges opp", "Tydelige avtaler uten skjulte vilkår", "Mulighet for fysisk og digital oppfølging"],
      faq: [
        { question: "Må jeg være godt trent fra før?", answer: "Nei. Opplegget kan tilpasses nybegynnere, viderekomne og personer som skal tilbake etter et opphold." },
        { question: "Kan jeg få en prøvetime?", answer: "Dersom det tilbys kan du bestille kartlegging eller prøvetime før du velger pakke eller medlemskap." },
        { question: "Tilbys digital oppfølging?", answer: "Program, innsjekk og veiledning kan tilbys digitalt når dette passer målet og tjenesten." },
      ],
      call_to_action: "Book en prøvetime",
      contact_text: "Fortell hva du ønsker å oppnå og hvilket nivå du starter på, så foreslår {companyName} et passende opplegg.",
      brand_color: "#be123c",
      secondary_color: "#4c0519",
      accent_color: "#fda4af",
    },
  }),
  template({
    slug: "frakt",
    name: "Transport & logistikk",
    category: "transport",
    description: "For bedrifter som faktisk selger frakt, logistikk, distribusjon, budbil eller flytting.",
    strongKeywords: ["fraktfirma", "transportfirma", "logistikkfirma", "spedisjon", "godstransport", "varetransport", "budbil", "flyttebyrå", "flyttebyra", "distribusjonstjenester"],
    supportingKeywords: ["frakt", "logistikk", "transport", "distribusjon", "levering", "terminal", "lager"],
    minimumScore: 18,
    defaults: {
      hero_title: "Transport som kommer frem som avtalt",
      hero_subtitle: "Frakt, distribusjon og logistikk med tydelig kapasitet, rute og prisforespørsel.",
      intro_text: "{companyName} hjelper bedrifter og privatkunder med transportoppdrag der tidspunkt, kapasitet og kommunikasjon må være på plass.",
      services: ["Lokal og regional transport", "Vare- og godstransport", "Budbil og ekspress", "Distribusjon", "Flytting og bortkjøring", "Fast transportavtale"],
      products: ["Enkeltoppdrag", "Fast rute", "Ekspresslevering", "Bedriftsavtale"],
      prices: ["Tilbud etter fra-/til-adresse, volum og tidspunkt", "Ventetid, bom og tillegg spesifiseres", "Fastpris kan avtales for faste ruter"],
      trust_points: ["Tydelig avtale om hentetid og levering", "Riktig bil og kapasitet til oppdraget", "Løpende kontakt ved avvik", "Dokumentasjon for bedriftskunder"],
      faq: [
        { question: "Hva trenger dere for å gi pris?", answer: "Oppgi hente- og leveringsadresse, dato, godstype, mål, vekt og behov for bærehjelp eller utstyr." },
        { question: "Tilbyr dere faste kjøreruter?", answer: "Faste ruter eller bedriftsavtaler kan vurderes ut fra frekvens, kapasitet og geografisk område." },
        { question: "Kan dere håndtere hasteoppdrag?", answer: "Oppgi tidspunkt og oppdragets størrelse, så avklares kapasitet og mulig levering." },
      ],
      call_to_action: "Be om transportpris",
      contact_text: "Send fra-/til-adresse, dato og informasjon om godset, så svarer {companyName} med kapasitet og pris.",
      brand_color: "#0284c7",
      secondary_color: "#0c4a6e",
      accent_color: "#f59e0b",
    },
  }),
];

const PROFILE_ZONES: Array<{ key: keyof LocalIndustryProfile; weight: number; label: string }> = [
  { key: "company_name", weight: 12, label: "bedriftsnavn" },
  { key: "title", weight: 10, label: "sidetittel" },
  { key: "description", weight: 6, label: "beskrivelse" },
  { key: "services", weight: 8, label: "tjenester" },
  { key: "products", weight: 7, label: "produkter" },
  { key: "summary", weight: 3, label: "brødtekst" },
];

function normalize(value: unknown) {
  const text = Array.isArray(value) ? value.join(" ") : String(value || "");
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasKeyword(text: string, keyword: string) {
  const normalizedKeyword = normalize(keyword);
  if (!text || !normalizedKeyword) return false;
  return ` ${text} `.includes(` ${normalizedKeyword} `);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function scoreTemplate(profile: LocalIndustryProfile, candidate: LocalIndustryTemplate) {
  let score = 0;
  const matchedKeywords: string[] = [];
  const strongMatches: string[] = [];
  const matchedZones: string[] = [];

  for (const zone of PROFILE_ZONES) {
    const sourceText = normalize(profile[zone.key]);
    if (!sourceText) continue;

    for (const keyword of candidate.strongKeywords) {
      if (!hasKeyword(sourceText, keyword)) continue;
      const phraseBonus = normalize(keyword).includes(" ") ? 1.25 : 1;
      score += Math.round(zone.weight * phraseBonus);
      matchedKeywords.push(keyword);
      strongMatches.push(keyword);
      matchedZones.push(zone.label);
    }

    for (const keyword of candidate.supportingKeywords) {
      if (!hasKeyword(sourceText, keyword)) continue;
      score += Math.max(1, Math.round(zone.weight * 0.28));
      matchedKeywords.push(keyword);
      matchedZones.push(zone.label);
    }
  }

  return {
    candidate,
    score,
    matchedKeywords: unique(matchedKeywords),
    strongMatches: unique(strongMatches),
    matchedZones: unique(matchedZones),
  };
}

export function classifyLocalIndustry(profile: LocalIndustryProfile): LocalIndustryClassification | null {
  const scored = LOCAL_INDUSTRY_TEMPLATES
    .map((candidate) => scoreTemplate(profile, candidate))
    .sort((a, b) => b.score - a.score);
  const winner = scored[0];
  const runnerUp = scored[1];
  if (!winner) return null;

  const minimumScore = winner.candidate.minimumScore || 12;
  if (winner.score < minimumScore || winner.strongMatches.length === 0) return null;

  // A generic word such as "transport" or "levering" must never make a roof,
  // furniture or product manufacturer look like a logistics company. Freight
  // requires at least one genuinely freight-specific phrase from strongKeywords.
  if (winner.candidate.slug === "frakt" && winner.strongMatches.length === 0) return null;

  const margin = winner.score - (runnerUp?.score || 0);
  const confidence = winner.score >= 30 && margin >= 8 ? "high" : "medium";
  const reasonKeywords = winner.matchedKeywords.slice(0, 5);
  const reason = `Valgte ${winner.candidate.name} fordi tydelige signaler (${reasonKeywords.join(", ")}) finnes i ${winner.matchedZones.slice(0, 3).join(", ")}.`;

  return {
    slug: winner.candidate.slug,
    name: winner.candidate.name,
    score: winner.score,
    confidence,
    reason,
    matchedKeywords: winner.matchedKeywords,
    strongMatches: winner.strongMatches,
    considered: scored.slice(0, 5).map((item) => ({
      slug: item.candidate.slug,
      score: item.score,
      matchedKeywords: item.matchedKeywords.slice(0, 6),
    })),
  };
}

export function getLocalIndustryTemplate(slug: string | null | undefined) {
  const normalized = normalize(slug).replace(/\s+/g, "-");
  return LOCAL_INDUSTRY_TEMPLATES.find((item) => item.slug === normalized) || null;
}

function replaceCompanyName(value: string, companyName: string) {
  return value.replace(/\{companyName\}/g, companyName || "Bedriften");
}

export function buildLocalIndustryTemplateFields(templateItem: LocalIndustryTemplate, companyName: string) {
  const defaults = templateItem.defaults;
  return {
    template_slug: templateItem.slug,
    template_name: templateItem.name,
    hero_title: replaceCompanyName(defaults.hero_title, companyName),
    hero_subtitle: replaceCompanyName(defaults.hero_subtitle, companyName),
    intro_text: replaceCompanyName(defaults.intro_text, companyName),
    services: [...defaults.services],
    products: [...defaults.products],
    prices: [...defaults.prices],
    trust_points: [...defaults.trust_points],
    faq: defaults.faq.map((item) => ({ ...item })),
    call_to_action: replaceCompanyName(defaults.call_to_action, companyName),
    contact_text: replaceCompanyName(defaults.contact_text, companyName),
    brand_color: defaults.brand_color,
    secondary_color: defaults.secondary_color,
    accent_color: defaults.accent_color,
    suggested_sections: [...defaults.suggested_sections],
  };
}

function isFreightFalsePositive(profile: LocalIndustryProfile) {
  if (profile.recommended_template_slug !== "frakt") return false;
  const freight = LOCAL_INDUSTRY_TEMPLATES.find((item) => item.slug === "frakt");
  if (!freight) return false;
  const fullText = normalize([
    profile.company_name,
    profile.title,
    profile.description,
    profile.services,
    profile.products,
    profile.summary,
  ]);
  return !freight.strongKeywords.some((keyword) => hasKeyword(fullText, keyword));
}

function isMeaningfulList(value: unknown, minimum = 1): value is unknown[] {
  return Array.isArray(value) && value.filter(Boolean).length >= minimum;
}

export function upgradeProfileImportResult(input: {
  profile: LocalIndustryProfile;
  editable_fields: Record<string, unknown>;
  warnings?: string[];
}) {
  const classification = classifyLocalIndustry(input.profile);
  const falseFreight = isFreightFalsePositive(input.profile);
  const selectedSlug = classification?.slug || (falseFreight ? "local-service" : input.profile.recommended_template_slug || "local-service");
  const changed = selectedSlug !== input.profile.recommended_template_slug || Boolean(classification);

  if (!changed) {
    return { ...input, changed: false, classification: null as LocalIndustryClassification | null };
  }

  const templateItem = classification ? getLocalIndustryTemplate(classification.slug) : null;
  const companyName = String(input.profile.company_name || "Bedriften");
  const defaults = templateItem ? buildLocalIndustryTemplateFields(templateItem, companyName) : null;
  const current = input.editable_fields || {};

  const profile = {
    ...input.profile,
    detected_industry: classification?.name || "Standard moderne bedriftsmal",
    recommended_template_slug: selectedSlug,
    confidence_score: classification ? Math.min(98, Math.max(Number(input.profile.confidence_score || 0), 60 + Math.round(classification.score / 2))) : 45,
    template_detection: classification
      ? {
          selected_template_slug: classification.slug,
          confidence_level: classification.confidence,
          reason: classification.reason,
          matched_keywords: classification.matchedKeywords,
          score: classification.score,
          fallback_used: false,
          considered_templates: classification.considered.map((item) => ({
            template_slug: item.slug,
            score: item.score,
            matched_keywords: item.matchedKeywords,
            accepted: item.slug === classification.slug,
          })),
          analysis_version: "weighted-zones-v2",
        }
      : {
          selected_template_slug: "local-service",
          confidence_level: "low",
          reason: "Ordet transport forekom, men ingen fraktspesifikke signaler ble funnet. Transport alene er et vanlig leveringsord og skal ikke bestemme bransje.",
          matched_keywords: ["transport"],
          score: 0,
          fallback_used: true,
          considered_templates: [],
          analysis_version: "weighted-zones-v2",
        },
  };

  const editableFields = {
    ...(defaults || {}),
    ...current,
    template_slug: selectedSlug,
    template_name: classification?.name || current.template_name || "Lokal servicebedrift",
    hero_title: defaults?.hero_title || current.hero_title,
    hero_subtitle: String(input.profile.description || "").trim() || current.hero_subtitle || defaults?.hero_subtitle,
    intro_text: String(input.profile.summary || "").trim() || current.intro_text || defaults?.intro_text,
    services: isMeaningfulList(input.profile.services, 3) ? input.profile.services : current.services || defaults?.services || [],
    products: isMeaningfulList(input.profile.products) ? input.profile.products : current.products || defaults?.products || [],
    prices: isMeaningfulList(input.profile.prices) ? input.profile.prices : current.prices || defaults?.prices || [],
    trust_points: current.trust_points || defaults?.trust_points || [],
    faq: current.faq || defaults?.faq || [],
    call_to_action: defaults?.call_to_action || current.call_to_action,
    contact_text: defaults?.contact_text || current.contact_text,
    profile_import_template_detection: profile.template_detection,
    profile_import_analysis_version: "weighted-zones-v2",
  };

  const warnings = [...(input.warnings || [])];
  if (falseFreight && !classification) {
    warnings.push("Transport ble ignorert som enkeltstående leveringsord. Ingen fraktspesifikk bransje ble valgt.");
  }
  if (classification) warnings.push(`Bransjeanalysen ble kvalitetssikret med vektede kilder: ${classification.name}.`);

  return { profile, editable_fields: editableFields, warnings, changed: true, classification };
}

export function getLocalIndustryTemplateSummaries() {
  return LOCAL_INDUSTRY_TEMPLATES.map(({ slug, name, category, description }) => ({ slug, name, category, description }));
}
