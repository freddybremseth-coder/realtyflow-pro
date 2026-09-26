export const CORPORATE_HOMES_LANDING_URL = "https://www.zenecohomes.com/bedriftshytte-spania";

export const CORPORATE_HOME_UTM = {
  google: {
    source: "google",
    medium: "cpc",
    campaign: "zeneco_corporate_homes_no",
  },
  linkedin: {
    source: "linkedin",
    medium: "paid_social",
    campaign: "zeneco_corporate_homes_no",
  },
  outbound: {
    source: "realtyflow",
    medium: "outbound",
    campaign: "zeneco_corporate_homes_no",
  },
} as const;

export const CORPORATE_GOOGLE_SEARCH = {
  name: "Zen Corporate Homes · Norway · Search",
  objective: "Qualified B2B lead",
  market: "Norway",
  landingPage: CORPORATE_HOMES_LANDING_URL,
  keywords: [
    "bedriftshytte spania",
    "firmahytte spania",
    "firmahytte utlandet",
    "bedriftsleilighet spania",
    "bolig i spania for ansatte",
    "feriebolig ansatte",
    "bedriftshytte ansatte",
    "medlemsbolig spania",
  ],
  negativeKeywords: [
    "jobb",
    "ledige stillinger",
    "airbnb",
    "langtidsleie",
    "privat leie",
    "gratis",
    "timeshare",
  ],
  adGroups: [
    {
      name: "Bedriftshytte",
      headlines: [
        "Bedriftshytte i Spania",
        "Gi ansatte et sted i solen",
        "Firmahytte på Costa Blanca",
      ],
      descriptions: [
        "Finn, kjøp og drift en moderne bolig i Spania for ansatte. Norsk rådgivning og lokal oppfølging.",
        "Fra behov og økonomi til bolig, kjøp og Property Care. Få en konkret bedriftsvurdering.",
      ],
    },
    {
      name: "Organisasjon og medlemmer",
      headlines: [
        "Medlemsbolig i Spania",
        "Et medlemsfordel de kan bruke",
        "Bolig på Costa Blanca for medlemmer",
      ],
      descriptions: [
        "Forening eller organisasjon? Utforsk en felles bolig i Spania med tydelig bruksmodell og lokal drift.",
        "Vi hjelper med boligvalg, beslutningsgrunnlag og praktisk oppfølging etter kjøpet.",
      ],
    },
  ],
} as const;

export const CORPORATE_LINKEDIN = {
  name: "Zen Corporate Homes · Norway · Decision Makers",
  objective: "B2B lead / booked discovery",
  market: "Norway",
  companySizes: ["11–50", "51–200", "201–500", "501–1000"],
  roles: [
    "CEO / Managing Director",
    "Founder / Owner",
    "HR / People & Culture",
    "CFO / Finance Director",
    "Chair / Board member",
    "Organisation / Association leader",
  ],
  sectors: [
    "Technology",
    "Consulting",
    "Engineering",
    "Construction",
    "Energy",
    "Finance & accounting",
    "Industrial companies",
    "Member organisations",
  ],
  creativeAngles: [
    {
      headline: "50 ansatte. Én bolig i Spania.",
      body: "Et ansattgode som faktisk kan brukes. Se hvordan en moderne bedriftshytte på Costa Blanca kan struktureres, kjøpes og driftes.",
    },
    {
      headline: "Fra norsk firmahytte til Costa Blanca",
      body: "Zen Corporate Homes hjelper bedrifter fra beslutningsgrunnlag til boligkjøp og lokal oppfølging.",
    },
    {
      headline: "Gi medlemmene mer enn en rabatt",
      body: "Foreninger og medlemsorganisasjoner kan utforske en felles bolig i Spania med planlagt booking og lokal drift.",
    },
  ],
} as const;

export const CORPORATE_OUTBOUND = {
  weeklyTarget: 25,
  initialSegments: [
    "Norwegian companies with 15–500 employees",
    "Professional and trade associations",
    "Member organisations with recurring fees",
    "Companies competing for specialist employees",
  ],
  qualificationQuestions: [
    "Hvor mange ansatte eller medlemmer skal kunne bruke ordningen?",
    "Er målet ansattgode, medlemsfordel, langsiktig eiendel eller en kombinasjon?",
    "Hvilket budsjett kan styret eller ledelsen realistisk vurdere?",
    "Hvor mange bruksuker per år ønsker dere å gjøre tilgjengelig?",
    "Hvem må være med på beslutningen: CEO, HR, CFO, styre eller medlemsledelse?",
  ],
} as const;

export const CORPORATE_SUCCESS_METRICS = [
  "Qualified corporate leads",
  "Booked B2B discovery calls",
  "Board/management decision cases created",
  "Corporate property shortlists",
  "Corporate viewings",
  "Reservations / purchases",
] as const;
